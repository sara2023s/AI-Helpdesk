import type { VercelRequest, VercelResponse } from '@vercel/node'
import { runAgent } from '../../../../lib/agents/runner'

export const config = {
  maxDuration: 300, // 5 minutes — requires Vercel Pro
}

async function getDb() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { id: ticketId, agentId } = req.query as { id: string; agentId: string }

  const db = await getDb()

  // Validate agent exists
  const { data: agent } = await db
    .from('agents')
    .select('status')
    .eq('id', agentId)
    .single()

  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (agent.status === 'busy') return res.status(409).json({ error: `${agentId} is currently busy` })

  // Validate ticket exists
  const { data: ticket } = await db
    .from('tickets')
    .select('id')
    .eq('id', ticketId)
    .single()

  if (!ticket) return res.status(404).json({ error: 'Ticket not found' })

  // Run agent (and auto-progress chain) synchronously within this request
  // The 300s maxDuration handles the full agent chain (avg 30-60s per agent)
  await runAgent(agentId, ticketId)

  return res.json({ ok: true })
}
