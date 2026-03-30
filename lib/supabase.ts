import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client — uses the service role key so it bypasses RLS.
// Only import this in API routes (api/**), never in src/** (frontend).
function getSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      `Missing Supabase env vars. SUPABASE_URL=${url ? 'set' : 'MISSING'}, SUPABASE_SERVICE_ROLE_KEY=${key ? 'set' : 'MISSING'}`,
    )
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

export const supabase = getSupabase()

// ─── Types that mirror the DB schema ──────────────────────────────────────────

export interface CommentRow {
  id: string
  authorId: string
  authorName: string
  content: string
  timestamp: string
  type: string
}

export interface TicketRow {
  id: string
  title: string
  description: string
  type: string
  priority: string
  project: string
  status: string
  assigned_to: string | null
  plan: string | null
  action_items: string[]
  tags: string[]
  comments: CommentRow[]
  created_at: string
  updated_at: string
}

export interface AgentRow {
  id: string
  name: string
  role: string
  emoji: string
  color: string
  status: string
  current_ticket_id: string | null
  last_active_at: string | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export async function getTicket(id: string): Promise<TicketRow | null> {
  const { data } = await supabase.from('tickets').select('*').eq('id', id).single()
  return data ?? null
}

export async function upsertTicket(ticket: TicketRow): Promise<TicketRow> {
  const { data, error } = await supabase
    .from('tickets')
    .upsert(ticket)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateAgent(
  id: string,
  patch: Partial<AgentRow>,
): Promise<AgentRow> {
  const { data, error } = await supabase
    .from('agents')
    .update({ ...patch, last_active_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}
