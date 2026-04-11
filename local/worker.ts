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
import { spawn, execSync } from 'child_process'
import { v4 as uuidv4 } from 'uuid'
import http from 'http'
import path from 'path'
import fs from 'fs'
import { PERSONAS } from '../lib/agents/personas.js'
import { getProject } from '../lib/projects.js'
import { notifyAgentUpdate, notifyTicketDone, notifyTicketBlocked, notifyTicketCreated } from '../lib/slack.js'

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
  deployToVercel?: boolean
}

// ─── Claude CLI runner ────────────────────────────────────────────────────────

// ─── Rate limit detection ─────────────────────────────────────────────────────

class RateLimitError extends Error {
  retryAfterMs: number
  retryAt: Date
  constructor(message: string, retryAfterMs: number) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfterMs = retryAfterMs
    this.retryAt = new Date(Date.now() + retryAfterMs)
  }
}

function parseRateLimitDelay(text: string): number {
  // Claude CLI outputs things like:
  //   "Claude AI usage limit reached. Resets in 4 hours 22 minutes"
  //   "Rate limit exceeded. Try again in 47 minutes"
  //   "Usage limits reset in 2h 15m"
  const lower = text.toLowerCase()
  const hours   = lower.match(/(\d+)\s*h(?:our)?/)?.[1]
  const minutes = lower.match(/(\d+)\s*m(?:in)?/)?.[1]
  if (hours || minutes) {
    const ms = ((parseInt(hours ?? '0') * 60) + (parseInt(minutes ?? '0') + 2)) * 60 * 1000
    return ms  // +2 min buffer
  }
  return 5 * 60 * 60 * 1000  // default: 5 hours (max Pro window)
}

function isRateLimitError(text: string): boolean {
  return /usage.?limit|rate.?limit|too.?many.?request|claude.ai.?limit|resets.?in/i.test(text)
}

// ─── Claude CLI runner ────────────────────────────────────────────────────────

function runClaude(systemPrompt: string, userMessage: string): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userMessage}`
  const env = { ...process.env }
  delete env.ANTHROPIC_API_KEY

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--dangerously-skip-permissions'], {
      shell: true,   // resolves claude.cmd on Windows
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let out = ''
    let err = ''
    proc.stdout.on('data', (d: Buffer) => { out += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { err += d.toString() })

    proc.stdin.write(fullPrompt, 'utf8')
    proc.stdin.end()

    const timer = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Claude timed out after 20 minutes'))
    }, 20 * 60 * 1000)

    proc.on('close', (code: number | null) => {
      clearTimeout(timer)
      if (code !== 0) {
        const errorText = err || out
        if (isRateLimitError(errorText)) {
          reject(new RateLimitError(errorText, parseRateLimitDelay(errorText)))
        } else {
          reject(new Error(`claude exited with code ${code}: ${errorText}`))
        }
      } else {
        resolve(out)
      }
    })

    proc.on('error', (e: Error) => { clearTimeout(timer); reject(e) })
  })
}

// ─── Agent stage messages (shown live in the UI while claude is running) ─────

const AGENT_STAGES: Record<string, string[]> = {
  manager:    ['Reading the ticket…', 'Assessing scope & complexity…', 'Mapping the team pipeline…', 'Writing the delivery plan…', 'Finalising routing decision…'],
  researcher: ['Scanning the market landscape…', 'Analysing competitors…', 'Profiling the target audience…', 'Identifying trends & gaps…', 'Compiling research report…'],
  analyst:    ['Reviewing project brief…', 'Writing user stories…', 'Defining acceptance criteria…', 'Scoping what\'s in & out…', 'Finalising requirements doc…'],
  brand:      ['Defining brand positioning…', 'Crafting tone of voice…', 'Developing personality traits…', 'Writing key messages…', 'Finalising brand strategy…'],
  designer:   ['Reviewing brand guidelines…', 'Designing layout structure…', 'Specifying colour palette…', 'Writing component specs…', 'Finalising responsive rules…'],
  developer:  ['Reading design specs…', 'Scaffolding project structure…', 'Writing core components…', 'Implementing logic & state…', 'Adding styles & animations…', 'Wiring up data persistence…', 'Reviewing & cleaning up…'],
  copywriter: ['Reading brand guidelines…', 'Drafting headlines & H1s…', 'Writing body copy…', 'Crafting CTAs & labels…', 'Reviewing tone & voice…'],
  seo:        ['Researching target keywords…', 'Analysing search intent…', 'Writing title & meta tags…', 'Reviewing content structure…', 'Finalising SEO brief…'],
  devops:     ['Reviewing infrastructure…', 'Checking deployment config…', 'Auditing performance…', 'Reviewing security…', 'Writing deployment notes…'],
  tester:     ['Running functional tests…', 'Checking responsiveness…', 'Testing accessibility…', 'Verifying edge cases…', 'Writing QA report…'],
  reviewer:   ['Reading implementation…', 'Reviewing code quality…', 'Checking security…', 'Auditing performance…', 'Writing review verdict…'],
  sales:      ['Reviewing project scope…', 'Drafting executive summary…', 'Writing scope of work…', 'Building timeline…', 'Finalising proposal…'],
}

async function updateTypingStage(ticketId: string, typingId: string, stage: string) {
  const { data } = await db.from('tickets').select('comments').eq('id', ticketId).single()
  if (!data) return
  const updated = (data.comments as any[]).map((c: any) =>
    c.id === typingId ? { ...c, content: stage } : c
  )
  await db.from('tickets').update({ comments: updated, updated_at: new Date().toISOString() }).eq('id', ticketId)
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

  // Bail out if ticket was paused before we started processing
  if (ticket.status === 'paused') {
    console.log(`   ⏸️  Ticket ${ticketId} is paused — skipping job`)
    await db.from('agent_queue').update({ status: 'cancelled', completed_at: new Date().toISOString() }).eq('id', jobId)
    await db.from('agents').update({ status: 'idle', current_ticket_id: null }).eq('id', agentId)
    return
  }

  // Pull latest from GitHub before making changes (developer/devops agents only)
  if (['developer', 'devops'].includes(agentId)) {
    const project = getProject(ticket.project)
    if (project?.localRelDir) {
      const localDir = path.resolve(process.cwd(), '..', project.localRelDir)
      if (fs.existsSync(localDir)) {
        try {
          console.log(`   📥 Pulling latest from GitHub...`)
          execSync('git pull --rebase', { cwd: localDir, shell: true, stdio: 'pipe' })
          console.log(`   ✅ Git pull complete`)
        } catch (err) {
          console.warn(`   ⚠️  Git pull failed (continuing anyway): ${(err as Error).message.split('\n')[0]}`)
        }
      }
    }
  }

  // Add typing indicator with first stage message
  const typingId = uuidv4()
  const stages = AGENT_STAGES[agentId] ?? ['Working on it…']
  await db.from('tickets').update({
    comments: [
      ...ticket.comments,
      { id: typingId, authorId: agentId, authorName: persona.name, content: stages[0], timestamp: new Date().toISOString(), type: 'typing' }
    ],
    updated_at: new Date().toISOString(),
  }).eq('id', ticketId)

  // Cycle through stage messages every 10s while claude is running
  let stageIndex = 0
  const stageTimer = setInterval(async () => {
    stageIndex = (stageIndex + 1) % stages.length
    await updateTypingStage(ticketId, typingId, stages[stageIndex]).catch(() => {})
  }, 10_000)

  try {
    const systemPrompt = persona.systemPrompt(ticket)
    const userMessage = `Please review and respond to ticket ${ticket.id}: "${ticket.title}". Remember to respond ONLY with a valid JSON object.`

    console.log(`   Calling claude CLI...`)
    const rawOutput = await runClaude(systemPrompt, userMessage)  // ← was missing await!
    clearInterval(stageTimer)
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

    // Normalise status — agents occasionally hallucinate invalid values
    const STATUS_ALIASES: Record<string, string> = {
      'qa': 'testing', 'test': 'testing',
      'in_progress': 'in-progress', 'inprogress': 'in-progress',
      'manager_review': 'manager-review', 'managerreview': 'manager-review',
      'awaiting-approval': 'awaiting_approval', 'awaitingapproval': 'awaiting_approval',
      'complete': 'done', 'completed': 'done', 'closed': 'done',
    }
    const VALID_STATUSES = new Set(['new','manager-review','awaiting_approval','in-progress','testing','review','done','blocked','paused'])
    const rawStatus = parsed.newStatus as string | undefined
    const rawLower = rawStatus?.toLowerCase()
    const normStatus = rawStatus
      ? (VALID_STATUSES.has(rawLower!) ? rawLower! : (STATUS_ALIASES[rawLower!] ?? base.status))
      : base.status
    if (rawStatus && rawStatus !== normStatus) {
      console.log(`   ⚠️  Normalised status "${rawStatus}" → "${normStatus}"`)
    }

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
      status: normStatus,
      assigned_to: parsed.assignTo ?? base.assigned_to,
      plan: (parsed.plan && !base.plan) ? parsed.plan : base.plan,
      action_items: parsed.actionItems?.length ? parsed.actionItems : base.action_items,
      updated_at: new Date().toISOString(),
    }).eq('id', ticketId)

    console.log(`   ✅ ${persona.name} done. Status: ${normStatus}${parsed.assignTo ? ` → next: ${parsed.assignTo}` : ''}`)

    // Write files locally — always write to disk first, never auto-commit to GitHub
    // User reviews locally, then clicks "Push to GitHub" in the UI
    if (parsed.files?.length) {
      const project = getProject(ticket.project)
      if (project?.localRelDir) {
        // Write to local project checkout for review
        const localDir = path.resolve(process.cwd(), '..', project.localRelDir)
        fs.mkdirSync(localDir, { recursive: true })
        for (const file of parsed.files) {
          const filePath = path.join(localDir, file.path)
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, file.content, 'utf8')
        }
        console.log(`   💾 Wrote ${parsed.files.length} file(s) to ${localDir}`)
        console.log(`   👁️  Review locally, then click "Push to GitHub" in the helpdesk UI`)
      } else {
        // No local dir configured — write to builds/ for preview
        const buildDir = path.join(process.cwd(), 'builds', ticketId)
        fs.mkdirSync(buildDir, { recursive: true })
        for (const file of parsed.files) {
          const filePath = path.join(buildDir, file.path)
          fs.mkdirSync(path.dirname(filePath), { recursive: true })
          fs.writeFileSync(filePath, file.content, 'utf8')
        }
        console.log(`   💾 Wrote ${parsed.files.length} file(s) to builds/${ticketId}/`)
        console.log(`   ▶️  To preview: cd builds/${ticketId} && npm install && npm run dev`)
      }
    }

    // Slack notifications
    const freshForSlack = { ...base, status: normStatus, comments: updatedComments }
    await notifyAgentUpdate(freshForSlack as any, agentId, persona.name, parsed.comment || '')
    if (normStatus === 'done') await notifyTicketDone(freshForSlack as any)
    if (parsed.needsClarification && parsed.clarificationQuestion) {
      await notifyTicketBlocked(freshForSlack as any, parsed.clarificationQuestion)
    }

    // Mark this job done BEFORE queuing the next agent — order matters
    await db.from('agent_queue').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', jobId)
    await db.from('agents').update({ status: 'idle', current_ticket_id: null, last_active_at: new Date().toISOString() }).eq('id', agentId)

    // Auto-progress: queue next agent if assigned (but not if awaiting plan approval or paused)
    const autoProgress = process.env.AUTO_PROGRESS !== 'false'
    if (autoProgress && parsed.assignTo && !parsed.needsClarification && normStatus !== 'done' && normStatus !== 'awaiting_approval' && normStatus !== 'paused' && PERSONAS[parsed.assignTo] && parsed.assignTo !== agentId) {
      console.log(`   ➡️  Handing off to ${parsed.assignTo}…`)
      await db.from('agent_queue').insert({ ticket_id: ticketId, agent_id: parsed.assignTo, status: 'pending' })
    }

  } catch (err) {
    clearInterval(stageTimer)

    // ── Rate limit: pause and auto-resume ────────────────────────────────────
    if (err instanceof RateLimitError) {
      const retryAt = err.retryAt
      const retryMs = err.retryAfterMs
      const timeStr = retryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      console.log(`\n⏸️  Claude Pro usage limit hit — pausing until ${timeStr} (${Math.round(retryMs / 60000)} min)`)

      // Update typing bubble to show the pause state
      const { data: rlTicket } = await db.from('tickets').select('*').eq('id', ticketId).single()
      const rlBase = rlTicket ?? ticket
      await db.from('tickets').update({
        comments: [
          ...rlBase.comments.filter((c: any) => c.id !== typingId),
          {
            id: typingId,
            authorId: agentId,
            authorName: persona.name,
            content: `⏸️ Usage limit reached — auto-resuming at ${timeStr}`,
            timestamp: new Date().toISOString(),
            type: 'typing',
          },
        ],
        updated_at: new Date().toISOString(),
      }).eq('id', ticketId)

      // Reset agent to idle so UI doesn't show them stuck
      await db.from('agents').update({ status: 'idle', current_ticket_id: null }).eq('id', agentId)

      // Mark job pending again with a retry_after marker in the error field
      // The poll will skip it until the time has passed
      await db.from('agent_queue').update({
        status: 'pending',
        started_at: null,
        error: `rate_limited:${retryAt.toISOString()}`,
      }).eq('id', jobId)

      // Remove from seenJobIds so it gets picked up again after reset
      seenJobIds.delete(jobId)

      // Wake the worker up exactly when the limit resets
      setTimeout(async () => {
        console.log(`\n⏰ Usage limit reset — resuming ${agentId} on ${ticketId}...`)
        // Clear the rate limit marker and re-trigger poll
        await db.from('agent_queue').update({ error: null }).eq('id', jobId)
        // Remove the pause bubble, replace with stage message
        const { data: resumeTicket } = await db.from('tickets').select('*').eq('id', ticketId).single()
        if (resumeTicket) {
          const stages = AGENT_STAGES[agentId] ?? ['Resuming…']
          await db.from('tickets').update({
            comments: [
              ...resumeTicket.comments.filter((c: any) => c.id !== typingId),
              { id: typingId, authorId: agentId, authorName: persona.name, content: stages[0], timestamp: new Date().toISOString(), type: 'typing' },
            ],
            updated_at: new Date().toISOString(),
          }).eq('id', ticketId)
        }
        await poll()
      }, retryMs)

      return
    }

    // ── Normal error ─────────────────────────────────────────────────────────
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

    await db.from('agents').update({ status: 'idle', current_ticket_id: null, last_active_at: new Date().toISOString() }).eq('id', agentId)
    await db.from('agent_queue').update({ status: 'failed', error: msg, completed_at: new Date().toISOString() }).eq('id', jobId)
  }
}

// ─── Sequential job queue (mutex) ────────────────────────────────────────────
// Only one job runs at a time. If a job arrives while one is running,
// it is held in memory and started immediately after the current one finishes.

let isProcessing = false
const waitingJobs: Array<{ id: string; ticket_id: string; agent_id: string }> = []
const seenJobIds = new Set<string>()  // dedup — realtime + poll can both see the same job

async function enqueueJob(job: { id: string; ticket_id: string; agent_id: string }) {
  if (seenJobIds.has(job.id)) return   // already queued or running
  seenJobIds.add(job.id)

  if (isProcessing) {
    console.log(`   ⏳ Agent busy — queuing ${job.agent_id} for ticket ${job.ticket_id}`)
    waitingJobs.push(job)
    return
  }

  await runNext(job)
}

async function runNext(job: { id: string; ticket_id: string; agent_id: string }) {
  isProcessing = true
  try {
    await processJob(job)
  } catch (err) {
    console.error('Unexpected error in processJob:', (err as Error).message)
  } finally {
    isProcessing = false
    // Brief pause so the UI can render the completed agent's comment before the next typing bubble appears
    if (waitingJobs.length > 0) {
      const next = waitingJobs.shift()!
      setTimeout(() => runNext(next), 1200)
    }
  }
}

// ─── Main polling loop ────────────────────────────────────────────────────────

async function poll() {
  if (isProcessing) return
  const { data: jobs } = await db
    .from('agent_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10)

  if (!jobs || jobs.length === 0) return

  for (const job of jobs) {
    // Skip jobs that are paused due to rate limiting
    if (job.error?.startsWith('rate_limited:')) {
      const retryAt = new Date(job.error.replace('rate_limited:', ''))
      if (Date.now() < retryAt.getTime()) {
        const mins = Math.round((retryAt.getTime() - Date.now()) / 60000)
        console.log(`   ⏸️  ${job.agent_id} paused — limit resets in ${mins}m (${retryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`)
        continue
      }
      // Time has passed — clear the marker and proceed
      await db.from('agent_queue').update({ error: null }).eq('id', job.id)
    }
    await enqueueJob(job)
    break
  }
}

async function main() {
  console.log('🤖 AI Helpdesk — Local Agent Worker')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('✅ Connected to Supabase')
  console.log('✅ Using Claude CLI (Pro subscription)')
  console.log('📡 Watching for jobs... (Ctrl+C to stop)\n')

  // On startup: reset stuck jobs and re-schedule any rate-limited ones
  const { data: stuckJobs } = await db.from('agent_queue').select('*').eq('status', 'processing')
  if (stuckJobs && stuckJobs.length > 0) {
    console.log(`⚠️  Found ${stuckJobs.length} stuck job(s) — resetting to pending...`)
    await db.from('agent_queue').update({ status: 'pending', started_at: null }).eq('status', 'processing')
    await db.from('agents').update({ status: 'idle', current_ticket_id: null }).eq('status', 'busy')
    console.log(`✅ Reset ${stuckJobs.length} stuck job(s)`)
  }

  // Re-arm timers for any rate-limited pending jobs (survived a restart)
  const { data: pausedJobs } = await db.from('agent_queue').select('*').eq('status', 'pending').like('error', 'rate_limited:%')
  if (pausedJobs && pausedJobs.length > 0) {
    for (const job of pausedJobs) {
      const retryAt = new Date(job.error.replace('rate_limited:', ''))
      const retryMs = Math.max(retryAt.getTime() - Date.now(), 0)
      const timeStr = retryAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      if (retryMs > 0) {
        console.log(`⏸️  ${job.agent_id} (${job.ticket_id}) rate-limited — will resume at ${timeStr}`)
        setTimeout(async () => {
          console.log(`\n⏰ Usage limit reset — resuming ${job.agent_id} on ${job.ticket_id}...`)
          await db.from('agent_queue').update({ error: null }).eq('id', job.id)
          seenJobIds.delete(job.id)
          await poll()
        }, retryMs)
      } else {
        // Already past the retry time — clear and let poll handle it
        await db.from('agent_queue').update({ error: null }).eq('id', job.id)
      }
    }
  }
  console.log('')

  // Poll every 3 seconds as a fallback (in case realtime misses an event)
  setInterval(async () => {
    try {
      await poll()
    } catch (err) {
      console.error('Poll error:', (err as Error).message)
    }
  }, 3000)

  // Instant pickup when a new job is queued
  db
    .channel('agent_queue_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agent_queue' }, async (payload) => {
      try {
        if (payload.new.status === 'pending') {
          await enqueueJob(payload.new as any)
        }
      } catch (err) {
        console.error('Realtime queue handler error:', (err as Error).message)
      }
    })
    .subscribe()

  // Auto-queue manager when a new ticket is created
  db
    .channel('ticket_inserts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, async (payload) => {
      try {
        const ticket = payload.new as any
        // Dedup — don't queue if manager is already pending/processing for this ticket
        const { data: existing } = await db.from('agent_queue').select('id')
          .eq('ticket_id', ticket.id).eq('agent_id', 'manager').in('status', ['pending', 'processing']).limit(1)
        if (existing && existing.length > 0) return
        console.log(`\n📋 New ticket: "${ticket.title}" — queuing Max (manager)...`)
        await Promise.all([
          db.from('agent_queue').insert({ ticket_id: ticket.id, agent_id: 'manager', status: 'pending' }),
          notifyTicketCreated(ticket),
        ])
      } catch (err) {
        console.error('Realtime ticket insert handler error:', (err as Error).message)
      }
    })
    .subscribe()

  // Watch for manual status changes in the UI — queue the right agent automatically
  db
    .channel('ticket_status_changes')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tickets' }, async (payload) => {
      try {
        const prev = payload.old as any
        const next = payload.new as any

        // Only act on status transitions (not every update like comment saves)
        if (prev.status === next.status) return

        // Map status → which agent should pick it up
        const STATUS_AGENT: Record<string, string> = {
          'manager-review':   'manager',
          'awaiting_approval': 'manager',
          'in-progress':       next.assigned_to ?? '',
          'testing':           'tester',
          'review':            'reviewer',
        }

        const agentToQueue = STATUS_AGENT[next.status]
        if (!agentToQueue || !PERSONAS[agentToQueue]) return

        // Don't double-queue — check if this agent already has a pending/processing job for this ticket
        const { data: existing } = await db
          .from('agent_queue')
          .select('id')
          .eq('ticket_id', next.id)
          .eq('agent_id', agentToQueue)
          .in('status', ['pending', 'processing'])
          .limit(1)

        if (existing && existing.length > 0) return  // already queued

        console.log(`\n🔄 Ticket "${next.title}" moved to ${next.status} — queuing ${agentToQueue}...`)
        await db.from('agent_queue').insert({ ticket_id: next.id, agent_id: agentToQueue, status: 'pending' })
      } catch (err) {
        console.error('Realtime status change handler error:', (err as Error).message)
      }
    })
    .subscribe()
}

// ─── Dev server manager ───────────────────────────────────────────────────────
// Tiny HTTP server on port 3001 so the UI can start/stop local preview servers.

interface DevServer {
  process: ReturnType<typeof spawn>
  port: number
  status: 'installing' | 'starting' | 'running' | 'error'
  url: string
}

const devServers = new Map<string, DevServer>()

/** Find the directory that contains package.json (or vite.config) — searches 2 levels deep */
function findProjectRoot(baseDir: string): string {
  // Check base dir itself
  if (fs.existsSync(path.join(baseDir, 'package.json'))) return baseDir
  // Check immediate subdirs (Dev sometimes nests the app in a folder)
  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const sub = path.join(baseDir, entry.name)
    if (fs.existsSync(path.join(sub, 'package.json'))) return sub
    // One more level
    for (const e2 of fs.readdirSync(sub, { withFileTypes: true })) {
      if (!e2.isDirectory()) continue
      const sub2 = path.join(sub, e2.name)
      if (fs.existsSync(path.join(sub2, 'package.json'))) return sub2
    }
  }
  return baseDir  // fall back to base, we'll scaffold package.json there
}

/** Scaffold a minimal package.json if one is missing (Dev forgot to write it) */
function ensurePackageJson(projectDir: string) {
  const pkgPath = path.join(projectDir, 'package.json')
  if (fs.existsSync(pkgPath)) return

  console.log(`   📦 No package.json found — scaffolding one...`)
  const hasViteConfig = fs.existsSync(path.join(projectDir, 'vite.config.ts')) || fs.existsSync(path.join(projectDir, 'vite.config.js'))
  const pkg = {
    name: 'momentum-app',
    version: '0.0.1',
    type: 'module',
    scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
    dependencies: {
      react: '^18.3.1', 'react-dom': '^18.3.1',
      'lucide-react': '^0.462.0', 'date-fns': '^3.6.0',
    },
    devDependencies: {
      '@types/react': '^18.3.12', '@types/react-dom': '^18.3.1',
      '@vitejs/plugin-react': '^4.3.2',
      typescript: '^5.6.2', vite: '^5.4.10',
      tailwindcss: '^3.4.14', autoprefixer: '^10.4.20', postcss: '^8.4.47',
    },
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8')

  // Also ensure index.html exists at root if missing
  if (hasViteConfig && !fs.existsSync(path.join(projectDir, 'index.html'))) {
    fs.writeFileSync(path.join(projectDir, 'index.html'), `<!DOCTYPE html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>App</title></head>
  <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>`, 'utf8')
  }
}

function startDevServer(ticketId: string): Promise<{ port: number; url: string }> {
  return new Promise((resolve, reject) => {
    const existing = devServers.get(ticketId)
    if (existing && existing.status === 'running') {
      return resolve({ port: existing.port, url: existing.url })
    }

    const buildDir = path.join(process.cwd(), 'builds', ticketId)
    if (!fs.existsSync(buildDir)) {
      return reject(new Error(`Build not found: builds/${ticketId}/ — run the ticket through Dev agent first.`))
    }

    // Find where package.json actually lives (Dev may have nested the project)
    const projectDir = findProjectRoot(buildDir)
    ensurePackageJson(projectDir)

    const port = 5200 + (devServers.size % 50)
    const url = `http://localhost:${port}`
    console.log(`\n▶️  Starting dev server for ${ticketId} at ${projectDir} on port ${port}...`)

    const needsInstall = !fs.existsSync(path.join(projectDir, 'node_modules'))
    const cmd = needsInstall
      ? `cd "${projectDir}" && npm install && npm run dev -- --port ${port} --host`
      : `cd "${projectDir}" && npm run dev -- --port ${port} --host`

    const entry: DevServer = { process: null as any, port, status: needsInstall ? 'installing (may take 1-2 min)' : 'starting', url }
    devServers.set(ticketId, entry)

    const proc = spawn(cmd, [], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    entry.process = proc

    let resolved = false
    const timer = setTimeout(() => {
      if (!resolved) { resolved = true; reject(new Error('Dev server timed out after 2 minutes')) }
    }, 120_000)

    proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString()
      process.stdout.write(`   [${ticketId}] ${line}`)
      if (!resolved && (line.includes('Local:') || line.includes(`localhost:${port}`))) {
        entry.status = 'running'
        resolved = true
        clearTimeout(timer)
        console.log(`   ✅ Ready: ${url}`)
        resolve({ port, url })
      }
    })
    proc.stderr.on('data', (d: Buffer) => { process.stderr.write(`   [${ticketId}] ${d}`) })
    proc.on('close', () => { devServers.delete(ticketId); console.log(`   [${ticketId}] dev server stopped`) })
    proc.on('error', (e) => { entry.status = 'error'; if (!resolved) { resolved = true; clearTimeout(timer); reject(e) } })
  })
}

function startDevServerHttp() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    const json = (code: number, body: object) => {
      res.writeHead(code, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    const startMatch = req.url?.match(/^\/start\/(.+)$/)
    if (req.method === 'POST' && startMatch) {
      const ticketId = decodeURIComponent(startMatch[1])
      try {
        const result = await startDevServer(ticketId)
        return json(200, { ok: true, ...result })
      } catch (err) {
        return json(500, { ok: false, error: (err as Error).message })
      }
    }

    const statusMatch = req.url?.match(/^\/status\/(.+)$/)
    if (req.method === 'GET' && statusMatch) {
      const srv = devServers.get(decodeURIComponent(statusMatch[1]))
      return json(200, srv ? { running: true, status: srv.status, url: srv.url, port: srv.port } : { running: false })
    }

    const stopMatch = req.url?.match(/^\/stop\/(.+)$/)
    if (req.method === 'POST' && stopMatch) {
      const srv = devServers.get(decodeURIComponent(stopMatch[1]))
      if (srv) { srv.process.kill(); devServers.delete(decodeURIComponent(stopMatch[1])) }
      return json(200, { ok: true })
    }

    // Push local changes to GitHub for a ticket's project
    const pushMatch = req.url?.match(/^\/push\/(.+)$/)
    if (req.method === 'POST' && pushMatch) {
      const ticketId = decodeURIComponent(pushMatch[1])
      try {
        const { data: ticket } = await db.from('tickets').select('project, title').eq('id', ticketId).single()
        if (!ticket) return json(404, { error: 'Ticket not found' })

        const project = getProject(ticket.project)
        if (!project?.localRelDir) return json(400, { error: `No local directory configured for project "${ticket.project}"` })

        const localDir = path.resolve(process.cwd(), '..', project.localRelDir)
        if (!fs.existsSync(localDir)) return json(400, { error: `Local directory not found: ${localDir}` })

        // Check if there's anything to commit
        const status = execSync('git status --porcelain', { cwd: localDir, shell: true }).toString().trim()
        if (!status) return json(200, { ok: true, message: 'Nothing to commit — working tree clean' })

        const commitMsg = `[${ticketId}] ${ticket.title}`
        execSync(`git add -A && git commit -m "${commitMsg.replace(/"/g, "'")}"`, { cwd: localDir, shell: true, stdio: 'pipe' })
        execSync(`git push origin ${project.branch}`, { cwd: localDir, shell: true, stdio: 'pipe' })

        console.log(`\n📤 Pushed ${ticketId} changes to ${project.owner}/${project.repo}`)
        return json(200, { ok: true, message: `Pushed to ${project.owner}/${project.repo}` })
      } catch (err) {
        const msg = (err as Error).message?.split('\n')[0] ?? String(err)
        console.error(`\n❌ Push failed for ${pushMatch[1]}:`, msg)
        return json(500, { ok: false, error: msg })
      }
    }

    json(404, { error: 'Not found' })
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn('⚠️  Port 3001 already in use — dev server manager skipped (another worker may be running)\n')
    } else {
      console.error('Dev server HTTP error:', err.message)
    }
  })
  server.listen(3001, () => console.log('🌐 Dev server manager on http://localhost:3001\n'))
}

startDevServerHttp()
main()
