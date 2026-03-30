import type { Agent, Ticket } from '../types'

interface Props {
  agents: Agent[]
  tickets: Ticket[]
  onAgentClick: (agent: Agent) => void
}

function StatusDot({ status }: { status: Agent['status'] }) {
  if (status === 'busy') {
    return (
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
      </span>
    )
  }
  if (status === 'idle') {
    return <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
  }
  return <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
}

function AgentCard({ agent, ticket, onClick }: { agent: Agent; ticket: Ticket | null; onClick: () => void }) {
  const isBusy = agent.status === 'busy'

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all duration-200 group
        ${isBusy
          ? 'bg-amber-950/30 border-amber-800/50 hover:border-amber-600'
          : 'bg-surface-800 border-surface-700 hover:border-slate-500'
        }`}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0 shadow-inner"
          style={{ backgroundColor: agent.color + '22', border: `1px solid ${agent.color}44` }}
        >
          {agent.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-100 leading-none">{agent.name}</span>
            <StatusDot status={agent.status} />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">{agent.role}</div>
        </div>
      </div>

      {isBusy && ticket && (
        <div className="mt-2 px-2 py-1 bg-amber-900/40 rounded-md border border-amber-800/30">
          <div className="text-[10px] text-amber-400 font-medium truncate">Working on: {ticket.id}</div>
          <div className="text-[10px] text-amber-300/70 truncate">{ticket.title}</div>
        </div>
      )}

      {!isBusy && agent.status === 'idle' && (
        <div className="mt-1.5 text-[10px] text-slate-600">Available</div>
      )}
    </button>
  )
}

export function WorkerPanel({ agents, tickets, onAgentClick }: Props) {
  const busyCount = agents.filter(a => a.status === 'busy').length

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col gap-3 h-full overflow-y-auto pr-1">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Team</span>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
          ${busyCount > 0 ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-800 text-slate-500'}`}>
          {busyCount}/{agents.length} active
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {agents.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface-800 rounded-xl animate-pulse border border-surface-700" />
          ))
        ) : (
          agents.map(agent => {
            const currentTicket = agent.currentTicketId
              ? tickets.find(t => t.id === agent.currentTicketId) ?? null
              : null
            return (
              <AgentCard
                key={agent.id}
                agent={agent}
                ticket={currentTicket}
                onClick={() => onAgentClick(agent)}
              />
            )
          })
        )}
      </div>
    </aside>
  )
}
