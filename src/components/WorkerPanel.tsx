import type { Agent, Ticket } from '../types'
import { AGENT_CONFIG } from '../types'

interface Props {
  agents: Agent[]
  tickets: Ticket[]
  onAgentClick: (agent: Agent) => void
}

export function WorkerPanel({ agents, tickets, onAgentClick }: Props) {
  const busy = agents.filter(a => a.status === 'busy')
  const idle = agents.filter(a => a.status !== 'busy')

  return (
    <div className="flex flex-col h-full bg-surface-900/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-700 flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Team</span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full
          ${busy.length > 0 ? 'bg-amber-900/60 text-amber-400 border border-amber-800/50' : 'bg-surface-800 text-slate-600 border border-surface-700'}`}>
          {busy.length}/{agents.length} active
        </span>
      </div>

      {/* Scrollable agent list */}
      <div className="flex-1 overflow-y-auto py-2">

        {/* Busy agents — prominent */}
        {busy.length > 0 && (
          <div className="px-3 mb-1">
            <div className="text-[9px] font-semibold text-amber-500/70 uppercase tracking-widest px-1 py-1">Working</div>
            <div className="flex flex-col gap-1">
              {busy.map(agent => {
                const ticket = agent.currentTicketId
                  ? tickets.find(t => t.id === agent.currentTicketId) ?? null
                  : null
                const cfg = AGENT_CONFIG[agent.id as keyof typeof AGENT_CONFIG]
                return (
                  <button
                    key={agent.id}
                    onClick={() => onAgentClick(agent)}
                    className="w-full text-left px-2.5 py-2 rounded-lg bg-amber-950/50 border border-amber-800/40 hover:border-amber-600/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center text-sm flex-shrink-0"
                        style={{ backgroundColor: cfg?.color + '22', border: `1px solid ${cfg?.color}44` }}
                      >
                        {agent.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-slate-100 leading-none">{agent.name}</span>
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 leading-none mt-0.5">{agent.role}</div>
                      </div>
                    </div>
                    {ticket && (
                      <div className="mt-1.5 pl-8 text-[10px] text-amber-400/80 truncate leading-none">{ticket.title}</div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Divider */}
        {busy.length > 0 && idle.length > 0 && (
          <div className="mx-3 my-2 border-t border-surface-700" />
        )}

        {/* Idle agents — compact list */}
        {idle.length > 0 && (
          <div className="px-3">
            {busy.length > 0 && (
              <div className="text-[9px] font-semibold text-slate-600 uppercase tracking-widest px-1 py-1">Available</div>
            )}
            <div className="flex flex-col gap-0.5">
              {idle.map(agent => {
                const cfg = AGENT_CONFIG[agent.id as keyof typeof AGENT_CONFIG]
                return (
                  <button
                    key={agent.id}
                    onClick={() => onAgentClick(agent)}
                    className="w-full text-left flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-surface-700/60 transition-colors group"
                  >
                    <span
                      className="w-5 h-5 rounded flex items-center justify-center text-xs flex-shrink-0"
                      style={{ backgroundColor: cfg?.color + '18' }}
                    >
                      {agent.emoji}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-slate-300 group-hover:text-slate-100 leading-none transition-colors truncate">{agent.name}</div>
                      <div className="text-[10px] text-slate-600 leading-none mt-0.5 truncate">{agent.role}</div>
                    </div>
                    <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${agent.status === 'idle' ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Skeleton while loading */}
        {agents.length === 0 && (
          <div className="px-3 flex flex-col gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-8 bg-surface-800 rounded-md animate-pulse border border-surface-700" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
