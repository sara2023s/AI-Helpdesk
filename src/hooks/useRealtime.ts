import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Ticket, Agent } from '../types'

interface Handlers {
  onTicketChange: (ticket: Ticket) => void
  onTicketInsert: (ticket: Ticket) => void
  onAgentChange: (agent: Agent) => void
}

// Maps a snake_case DB row back to the camelCase Ticket shape the UI uses.
function rowToTicket(row: Record<string, unknown>): Ticket {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    type: row.type as Ticket['type'],
    priority: row.priority as Ticket['priority'],
    project: row.project as string,
    status: row.status as Ticket['status'],
    assignedTo: (row.assigned_to as Ticket['assignedTo']) ?? null,
    plan: (row.plan as string) ?? null,
    actionItems: (row.action_items as string[]) ?? [],
    tags: (row.tags as string[]) ?? [],
    comments: (row.comments as Ticket['comments']) ?? [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

// Maps a snake_case DB row to the Agent shape the UI uses.
function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as Agent['id'],
    name: row.name as string,
    role: row.role as string,
    emoji: row.emoji as string,
    color: row.color as string,
    status: row.status as Agent['status'],
    currentTicketId: (row.current_ticket_id as string) ?? null,
    lastActiveAt: (row.last_active_at as string) ?? null,
  }
}

export function useRealtime({ onTicketChange, onTicketInsert, onAgentChange }: Handlers) {
  useEffect(() => {
    const channel = supabase
      .channel('helpdesk-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tickets' },
        (payload) => {
          if (payload.new) onTicketInsert(rowToTicket(payload.new as Record<string, unknown>))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tickets' },
        (payload) => {
          if (payload.new) onTicketChange(rowToTicket(payload.new as Record<string, unknown>))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agents' },
        (payload) => {
          if (payload.new) onAgentChange(rowToAgent(payload.new as Record<string, unknown>))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'agents' },
        (payload) => {
          if (payload.new) onAgentChange(rowToAgent(payload.new as Record<string, unknown>))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [onTicketChange, onTicketInsert, onAgentChange])
}
