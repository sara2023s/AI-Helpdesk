import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../../lib/supabase'
import type { TicketRow } from '../../../lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,PATCH,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const { id } = req.query as { id: string }

  if (req.method === 'GET') {
    const db = await getDb()
    const { data, error } = await db
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single()
    if (error || !data) return res.status(404).json({ error: 'Ticket not found' })
    return res.json(data)
  }

  if (req.method === 'PATCH') {
    const patch = req.body as Partial<TicketRow>
    const db = await getDb()
    const { data, error } = await db
      .from('tickets')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error || !data) return res.status(404).json({ error: 'Ticket not found' })
    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
