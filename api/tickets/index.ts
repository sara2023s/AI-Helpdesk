import type { VercelRequest, VercelResponse } from '@vercel/node'
import { v4 as uuidv4 } from 'uuid'

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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method === 'GET') {
    const db = await getDb()
    const { data, error } = await db
      .from('tickets')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { title, description, type, priority, project, tags } = req.body as {
      title: string
      description: string
      type: string
      priority: string
      project: string
      tags?: string[]
    }

    if (!title?.trim() || !description?.trim()) {
      return res.status(400).json({ error: 'title and description are required' })
    }

    const now = new Date().toISOString()
    const ticket = {
      id: `T-${Date.now()}`,
      title: title.trim(),
      description: description.trim(),
      type: type ?? 'feature',
      priority: priority ?? 'P2',
      project: project ?? 'General',
      status: 'new',
      assigned_to: null,
      plan: null,
      action_items: [],
      tags: tags ?? [],
      comments: [],
      created_at: now,
      updated_at: now,
    }

    const db = await getDb()
    const { data, error } = await db
      .from('tickets')
      .insert(ticket)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })

    return res.status(201).json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
