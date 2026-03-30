import type { VercelRequest, VercelResponse } from '@vercel/node'
import { v4 as uuidv4 } from 'uuid'
import { supabase, getTicket, upsertTicket } from '../../../lib/supabase'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { id } = req.query as { id: string }
  const { content } = req.body as { content: string }

  if (!content?.trim()) return res.status(400).json({ error: 'content is required' })

  const ticket = await getTicket(id)
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' })

  const updated = await upsertTicket({
    ...ticket,
    comments: [
      ...ticket.comments,
      {
        id: uuidv4(),
        authorId: 'user',
        authorName: 'You',
        content: content.trim(),
        timestamp: new Date().toISOString(),
        type: 'comment',
      },
    ],
    updated_at: new Date().toISOString(),
  })

  return res.json(updated)
}
