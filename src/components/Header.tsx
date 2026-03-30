import { Plus, RefreshCw } from 'lucide-react'
import { UsageBars } from './UsageBars'
import type { Usage } from '../types'

interface Props {
  usage: Usage | null
  onNewTicket: () => void
  onRefresh: () => void
  refreshing: boolean
}

export function Header({ usage, onNewTicket, onRefresh, refreshing }: Props) {
  return (
    <header className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-surface-700 bg-surface-900/80 backdrop-blur-sm">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-violet-900/50">
          A
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-100 leading-none">Appdoers</h1>
          <p className="text-[10px] text-slate-500 mt-0.5">AI Helpdesk</p>
        </div>
      </div>

      {/* Usage bars */}
      <div className="hidden md:block">
        <UsageBars usage={usage} />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="p-2 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
        </button>
        <button
          onClick={onNewTicket}
          className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium
            rounded-lg transition-colors shadow-lg shadow-violet-900/30"
        >
          <Plus size={15} />
          New Ticket
        </button>
      </div>
    </header>
  )
}
