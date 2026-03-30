import type { Ticket, Agent, Usage } from './types'

const BASE = '/api'

// ─── Ticket helpers ────────────────────────────────────────────────────────────

// The DB stores snake_case; map to the camelCase Ticket type for the UI.
function mapTicket(raw: Record<string, unknown>): Ticket {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: raw.description as string,
    type: raw.type as Ticket['type'],
    priority: raw.priority as Ticket['priority'],
    project: raw.project as string,
    status: raw.status as Ticket['status'],
    assignedTo: (raw.assigned_to ?? raw.assignedTo) as Ticket['assignedTo'],
    plan: (raw.plan ?? null) as string | null,
    actionItems: ((raw.action_items ?? raw.actionItems) as string[]) ?? [],
    tags: (raw.tags as string[]) ?? [],
    comments: (raw.comments as Ticket['comments']) ?? [],
    createdAt: (raw.created_at ?? raw.createdAt) as string,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as string,
  }
}

function mapAgent(raw: Record<string, unknown>): Agent {
  return {
    id: raw.id as Agent['id'],
    name: raw.name as string,
    role: raw.role as string,
    emoji: raw.emoji as string,
    color: raw.color as string,
    status: raw.status as Agent['status'],
    currentTicketId: ((raw.current_ticket_id ?? raw.currentTicketId) as string) ?? null,
    lastActiveAt: ((raw.last_active_at ?? raw.lastActiveAt) as string) ?? null,
  }
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchTickets(): Promise<Ticket[]> {
  const r = await fetch(`${BASE}/tickets`)
  if (!r.ok) throw new Error('Failed to fetch tickets')
  const raw = await r.json() as Record<string, unknown>[]
  return raw.map(mapTicket)
}

export async function fetchTicket(id: string): Promise<Ticket> {
  const r = await fetch(`${BASE}/tickets/${id}`)
  if (!r.ok) throw new Error('Ticket not found')
  return mapTicket(await r.json())
}

export async function createTicket(data: {
  title: string
  description: string
  type: string
  priority: string
  project: string
  tags?: string[]
}): Promise<Ticket> {
  const r = await fetch(`${BASE}/tickets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!r.ok) throw new Error('Failed to create ticket')
  return mapTicket(await r.json())
}

export async function updateTicket(id: string, data: Partial<Ticket>): Promise<Ticket> {
  // Convert camelCase back to snake_case for the API
  const body: Record<string, unknown> = { ...data }
  if ('assignedTo' in data) { body.assigned_to = data.assignedTo; delete body.assignedTo }
  if ('actionItems' in data) { body.action_items = data.actionItems; delete body.actionItems }
  if ('createdAt' in data) { body.created_at = data.createdAt; delete body.createdAt }
  if ('updatedAt' in data) { body.updated_at = data.updatedAt; delete body.updatedAt }

  const r = await fetch(`${BASE}/tickets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error('Failed to update ticket')
  return mapTicket(await r.json())
}

export async function addComment(id: string, content: string): Promise<Ticket> {
  const r = await fetch(`${BASE}/tickets/${id}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!r.ok) throw new Error('Failed to add comment')
  return mapTicket(await r.json())
}

export async function triggerAgent(ticketId: string, agentId: string): Promise<void> {
  const r = await fetch(`${BASE}/tickets/${ticketId}/trigger/${agentId}`, {
    method: 'POST',
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: 'Agent busy or unavailable' }))
    throw new Error((err as { error: string }).error || 'Failed to trigger agent')
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  const r = await fetch(`${BASE}/agents`)
  if (!r.ok) throw new Error('Failed to fetch agents')
  const raw = await r.json() as Record<string, unknown>[]
  return raw.map(mapAgent)
}

export async function fetchUsage(): Promise<Usage> {
  const r = await fetch(`${BASE}/usage`)
  if (!r.ok) throw new Error('Failed to fetch usage')
  return r.json()
}
