/**
 * Local Agent Worker
 * ------------------
 * Run this on your machine: npm run agents
 *
 * Watches Supabase agent_queue for pending jobs and processes them
 * using the Claude CLI (your Pro subscription) — no API key needed.
 *
 * Prerequisites:
 *   - Claude Code CLI installed: npm install -g @anthropic-ai/claude-code
 *   - Logged in: claude  (just run it once to authenticate)
 *   - .env.local has SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { PERSONAS } from '../lib/agents/personas.js'
import { getProject } from '../lib/projects.js'

// ─── Load env ────────────────────────────────────────────────────────────────

import { config } from 'dotenv'
config({ path: '.env.local' })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentResponse {
  comment: string
  newStatus: string
  assignTo: string | null
  needsClarification: boolean
  clarificationQuestion: string | null
  plan: string | null
  actionItems: string[]
  files?: Array<{ path: string; content: string; description?: string }>
}

// ─── Claude CLI runner ────────────────────────────────────────────────────────

function runClaude(systemPrompt: string, userMessage: string): string {
  // Write prompt to a temp file to avoid shell length limits
  const tmpFile = join(tmpdir(), `claude-prompt-${Date.now()}.txt`)
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`

  writeFileSync(tmpFile, fullPrompt, 'utf8')

  try {
    const result = spawnSync(
      'claude',
      [
        '--print',
        '--dangerously-skip-permissions',
        fullPrompt,
      ],
      {
        encoding: 'utf8',
        timeout: 180_000, // 3 min per agent
        maxBuffer: 10 * 1024 * 1024, // 10MB
      }
    )

    if (result.error) throw result.error
    if (result.status !== 0) {
      throw new Error(`claude exited with code ${result.status}: ${result.stderr}`)
    }

    return result.stdout || ''
  } finally {
    try { unlinkSync(tmpFile) } catch {}
  }
}

// ─── Process one job ─────────────────────────────────────────────────────────

async function processJob(job: { id: string; ticket_id: string; agent_id: string }) {
  const { id: jobId, ticket_id: ticketId, agent_id: agentId } = job
  const persona = PERSONAS[agentId]

  if (!persona) {
    await db.from('agent_queue').update({ status: 'failed', error: `Unknown agent: ${agentId}`, completed_at: new Date().toISOString() }).eq('id', jobId)
    return
  }

  console.log(`\n🚀 [${persona.emoji} ${persona.name}] Working on ticket ${ticketId}...`)

  // Mark job processing + agent busy
  await Promise.all([
    db.from('agent_queue').update({ status: 'processing', started_at: new Date().toISOString() }).eq('id', jobId),
    db.from('agents').update({ status: 'busy', current_ticket_id: ticketId, last_active_at: new Date().toISOString() }).eq('id', agentId),
  ])

  // Get latest ticket
  const { data: ticket } = await db.from('tickets').select('*').eq('id', ticketId).single()
  if (!ticket) {
    await db.from('agent_queue').update({ status: 'failed', error: 'Ticket not found', completed_at: new Date().toISOString() }).eq('id', jobId)
    await db.from('agents').update({ status: 'idle', current_ticket_id: null }).eq('id', agentId)
    return
  }

  // Add typing indicator
  const typingId = uuidv4()
  await db.from('tickets').update({
    comments: [
      ...ticket.comments,
      { id: typingId, authorId: agentId, authorName: persona.name, content: `${persona.emoji} thinking...`, timestamp: new Date().toISOString(), type: 'typing' }
    ],
    updated_at: new Date().toISOString(),
  }).eq('id', ticketId)

  try {
    const systemPrompt = persona.systemPrompt(ticket)
    const userMessage = `Please review and respond to ticket ${ticket.id}: "${ticket.title}". Remember to respond ONLY with a valid JSON object.`

    console.log(`   Calling claude CLI...`)
    const rawOutput = runClaude(systemPrompt, userMessage)
    console.log(`   ✅ Got response (${rawOutput.length} chars)`)

    // Parse JSON from output
    let parsed: AgentResponse
    try {
      const match = rawOutput.match(/\{[\s\S]*\}/)
      parsed = JSON.parse(match ? match[0] : rawOutput.trim())
    } catch {
      parsed = {
        comment: rawOutput || 'I reviewed this ticket and will follow up shortly.',
        newStatus: ticket.status,
        assignTo: null,
        needsClarification: false,
        clarificationQuestion: null,
        plan: null,
        actionItems: [],
      }
    }

    // Fetch fresh ticket, remove typing bubble, apply changes
    const { data: freshTicket } = await db.from('tickets').select('*').eq('id', ticketId).single()
    const base = freshTicket ?? ticket
    const withoutTyping = base.comments.filter((c: any) => c.id !== typingId)

    const updatedComments = [
      ...withoutTyping,
      {
        id: uuidv4(),
        authorId: agentId,
        authorName: persona.name,
        content: parsed.comment || 'Task reviewed.',
        timestamp: new Date().toISOString(),
        type: parsed.needsClarification ? 'question' : agentId === 'manager' ? 'plan' : 'comment',
      }
    ]

    await db.from('tickets').update({
      comments: updatedComments,
      status: parsed.newStatus ?? base.status,
      assigned_to: parsed.assignTo ?? base.assigned_to,
      plan: (parsed.plan && !base.plan) ? parsed.plan : base.plan,
      action_items: parsed.actionItems?.length ? parsed.actionItems : base.action_items,
      updated_at: new Date().toISOString(),
    }).eq('id', ticketId)

    // Commit files to GitHub if agent produced any
    if (parsed.files?.length) {
      const { commitFiles } = await import('../lib/github.js')
      const project = getProject(ticket.project)
      if (project) {
        const result = await commitFiles(project.owner, project.repo, project.branch, parsed.files, ticket.id, persona.name)
        console.log(result.success ? `   📦 Committed ${result.files.length} file(s): ${result.commitUrl}` : `   ⚠️ Commit failed: ${result.error}`)
      }
    }

    console.log(`   ✅ ${persona.name} done. Status: ${parsed.newStatus ?? base.status}${parsed.assignTo ? ` → next: ${parsed.assignTo}` : ''}`)

    // Auto-progress: queue next agent if assigned
    const autoProgress = process.env.AUTO_PROGRESS !== 'false'
    if (autoProgress && parsed.assignTo && !parsed.needsClarification && parsed.newStatus !== 'done' && PERSONAS[parsed.assignTo] && parsed.assignTo !== agentId) {
      console.log(`   ➡️  Queuing ${parsed.assignTo}...`)
      await db.from('agent_queue').insert({ ticket_id: ticketId, agent_id: parsed.assignTo, status: 'pending' })
    }

    await db.from('agent_queue').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', jobId)

  } catch (err) {
    const msg = (err as Error).message
    console.error(`   ❌ Error: ${msg}`)

    const { data: freshTicket } = await db.from('tickets').select('*').eq('id', ticketId).single()
    const base = freshTicket ?? ticket
    await db.from('tickets').update({
      comments: [
        ...base.comments.filter((c: any) => c.id !== typingId),
        { id: uuidv4(), authorId: agentId, authorName: persona.name, content: `⚠️ I ran into an issue: ${msg}`, timestamp: new Date().toISOString(), type: 'system' }
      ],
      updated_at: new Date().toISOString(),
    }).eq('id', ticketId)

    await db.from('agent_queue').update({ status: 'failed', error: msg, completed_at: new Date().toISOString() }).eq('id', jobId)
  } finally {
    await db.from('agents').update({ status: 'idle', current_ticket_id: null, last_active_at: new Date().toISOString() }).eq('id', agentId)
  }
}

// ─── Main polling loop ────────────────────────────────────────────────────────

async function poll() {
  // Pick oldest pending job
  const { data: jobs } = await db
    .from('agent_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)

  if (jobs && jobs.length > 0) {
    await processJob(jobs[0])
  }
}

async function main() {
  console.log('🤖 AI Helpdesk — Local Agent Worker')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Connected to Supabase')
  console.log('✅ Using Claude CLI (Pro subscription)')
  console.log('📡 Watching for jobs... (Ctrl+C to stop)\n')

  // Poll every 3 seconds
  setInterval(async () => {
    try {
      await poll()
    } catch (err) {
      console.error('Poll error:', (err as Error).message)
    }
  }, 3000)

  // Also use Supabase Realtime for instant pickup
  db
    .channel('agent_queue_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_queue' }, async (payload) => {
      if (payload.new.status === 'pending') {
        await processJob(payload.new as any)
      }
    })
    .subscribe()
}

main()
