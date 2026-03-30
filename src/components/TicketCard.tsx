import type { Ticket } from '../types'
import { STATUS_CONFIG, PRIORITY_CONFIG, AGENT_CONFIG } from '../types'

interface Props {
  ticket: Ticket
  onClick: () => void
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function TicketCard({ ticket, onClick }: Props) {
  const status = STATUS_CONFIG[ticket.status]
  const priority = PRIORITY_CONFIG[ticket.priority]
  const agent = ticket.assignedTo ? AGENT_CONFIG[ticket.assignedTo] : null
  const lastComment = ticket.comments.filter(c => c.type !== 'typing').at(-1)
  const isTyping = ticket.comments.some(c => c.type === 'typing')

  return (
    <div
      onClick={onClick}
      className="ticket-card bg-surface-800 border border-surface-700 rounded-xl p-3 cursor-pointer
        hover:border-slate-500 active:scale-[0.99]"
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono text-slate-500">{ticket.id}</span>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
          <span className={`text-[10px] font-medium ${priority.color}`}>{ticket.priority}</span>
        </div>
      </div>

      <p className="text-sm font-medium text-slate-100 leading-snug line-clamp-2 mb-2">
        {ticket.title}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 truncate max-w-[80px]">{ticket.project}</span>
        <div className="flex items-center gap-2">
          {agent && (
            <span
              className="text-sm w-5 h-5 rounded flex items-center justify-center"
              style={{ backgroundColor: agent.color + '22' }}
              title={agent.name}
            >
              {agent.emoji}
            </span>
          )}
          <span className="text-[10px] text-slate-600">{timeAgo(ticket.updatedAt)}</span>
        </div>
      </div>

      {isTyping && (
        <div className="mt-2 flex items-center gap-1.5 text-amber-400">
          <span className="text-xs">{agent?.emoji ?? '🤖'}</span>
          <div className="flex gap-0.5">
            <span className="typing-dot w-1 h-1 bg-amber-400 rounded-full inline-block" />
            <span className="typing-dot w-1 h-1 bg-amber-400 rounded-full inline-block" />
            <span className="typing-dot w-1 h-1 bg-amber-400 rounded-full inline-block" />
          </div>
        </div>
      )}

      {!isTyping && lastComment && lastComment.authorId !== 'user' && (
        <div className="mt-2 text-[10px] text-slate-500 line-clamp-1 border-t border-surface-700 pt-1.5">
          <span className="text-slate-400">{lastComment.authorName}:</span>{' '}
          {lastComment.content.replace(/```[\s\S]*?```/g, '[code]').substring(0, 80)}
        </div>
      )}
    </div>
  )
}
