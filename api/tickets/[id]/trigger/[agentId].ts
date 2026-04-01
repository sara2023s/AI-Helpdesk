import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = {
  maxDuration: 10,
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

  // Validate agent
  const { data: agent } = await db.from('agents').select('status').eq('id', agentId).single()
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  if (agent.status === 'busy') return res.status(409).json({ error: `${agentId} is currently busy` })

  // Validate ticket
  const { data: ticket } = await db.from('tickets').select('id').eq('id', ticketId).single()
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' })

  // Queue the job — local worker picks it up and runs it using Claude CLI (Pro subscription)
  const { error } = await db.from('agent_queue').insert({
    ticket_id: ticketId,
    agent_id: agentId,
    status: 'pending',
  })

  if (error) return res.status(500).json({ error: error.message })

  return res.json({ ok: true, queued: true, message: 'Job queued — make sure npm run agents is running on your machine' })
}
