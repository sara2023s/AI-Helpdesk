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

  const { id: ticketId } = req.query as { id: string }
  const { action } = req.body as { action: 'pause' | 'resume' }

  if (action !== 'pause' && action !== 'resume') {
    return res.status(400).json({ error: 'action must be "pause" or "resume"' })
  }

  const db = await getDb()

  const { data: ticket } = await db.from('tickets').select('id, status').eq('id', ticketId).single()
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' })

  if (action === 'pause') {
    // Set ticket to paused and fail all pending agent_queue jobs for this ticket
    // Note: agent_queue status constraint only allows: pending/processing/done/failed
    const [ticketResult] = await Promise.all([
      db.from('tickets')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', ticketId)
        .select()
        .single(),
      db.from('agent_queue')
        .update({ status: 'failed', error: 'paused_by_user', completed_at: new Date().toISOString() })
        .eq('ticket_id', ticketId)
        .eq('status', 'pending'),
    ])
    if (ticketResult.error) return res.status(500).json({ error: ticketResult.error.message })
    return res.json(ticketResult.data)
  }

  // resume — move back to in-progress
  const { data, error } = await db.from('tickets')
    .update({ status: 'in-progress', updated_at: new Date().toISOString() })
    .eq('id', ticketId)
    .select()
    .single()
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
}
