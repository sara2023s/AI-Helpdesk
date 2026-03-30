import type { Ticket, TicketStatus } from '../types'
import { STATUS_CONFIG, KANBAN_COLUMNS } from '../types'
import { TicketCard } from './TicketCard'

interface Props {
  tickets: Ticket[]
  onTicketClick: (ticket: Ticket) => void
}

const COLUMN_ICONS: Record<TicketStatus, string> = {
  'new':            '📥',
  'manager-review': '🧠',
  'in-progress':    '⚡',
  'testing':        '🧪',
  'review':         '🔍',
  'done':           '✅',
  'blocked':        '🚨',
}

function Column({ status, tickets, onTicketClick }: {
  status: TicketStatus
  tickets: Ticket[]
  onTicketClick: (t: Ticket) => void
}) {
  const cfg = STATUS_CONFIG[status]
  const icon = COLUMN_ICONS[status]
  const p0Count = tickets.filter(t => t.priority === 'P0').length

  return (
    <div className="flex-shrink-0 w-64 flex flex-col h-full">
      <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-b ${cfg.bg} ${cfg.border} border border-b-0`}>
        <span className="text-sm">{icon}</span>
        <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.color}`}>
          {cfg.label}
        </span>
        <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
          {tickets.length}
        </span>
        {p0Count > 0 && (
          <span className="text-[10px] px-1 py-0.5 rounded bg-red-900/50 text-red-400 border border-red-800">
            🔴{p0Count}
          </span>
        )}
      </div>

      <div
        className={`flex-1 overflow-y-auto p-2 flex flex-col gap-2 rounded-b-xl border ${cfg.border} border-t-0
          ${status === 'blocked' ? 'bg-red-950/10' : 'bg-surface-900/50'}`}
        style={{ minHeight: 120 }}
      >
        {tickets.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[11px] text-slate-700 text-center py-4">No tickets</p>
          </div>
        ) : (
          tickets.map(t => (
            <TicketCard key={t.id} ticket={t} onClick={() => onTicketClick(t)} />
          ))
        )}
      </div>
    </div>
  )
}

export function KanbanBoard({ tickets, onTicketClick }: Props) {
  const byStatus = (status: TicketStatus) =>
    tickets
      .filter(t => t.status === status)
      .sort((a, b) => {
        const pOrder = { P0: 0, P1: 1, P2: 2, P3: 3 }
        return pOrder[a.priority] - pOrder[b.priority]
      })

  return (
    <div className="flex gap-3 h-full overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map(status => (
        <Column
          key={status}
          status={status}
          tickets={byStatus(status)}
          onTicketClick={onTicketClick}
        />
      ))}
    </div>
  )
}
