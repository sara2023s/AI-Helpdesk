import { useState, useEffect, useCallback } from 'react'
import { Header } from './components/Header'
import { WorkerPanel } from './components/WorkerPanel'
import { KanbanBoard } from './components/KanbanBoard'
import { TicketDetail } from './components/TicketDetail'
import { CreateTicketModal } from './components/CreateTicketModal'
import { useRealtime } from './hooks/useRealtime'
import { fetchTickets, fetchAgents, fetchUsage } from './api'
import type { Ticket, Agent, Usage } from './types'

export default function App() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [usage, setUsage] = useState<Usage | null>(null)
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  async function loadAll() {
    setRefreshing(true)
    try {
      const [t, a, u] = await Promise.all([fetchTickets(), fetchAgents(), fetchUsage()])
      setTickets(t)
      setAgents(a)
      setUsage(u)
    } catch (e) {
      console.error('Failed to load data:', e)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  // Refresh usage stats every 30s so window percentages stay accurate
  useEffect(() => {
    const interval = setInterval(() => {
      fetchUsage().then(setUsage).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Supabase Realtime — live updates replace SSE
  const handleTicketChange = useCallback((ticket: Ticket) => {
    setTickets(prev => prev.map(t => t.id === ticket.id ? ticket : t))
    setSelectedTicket(prev => prev?.id === ticket.id ? ticket : prev)
    // Refresh usage after any agent activity
    fetchUsage().then(setUsage).catch(() => {})
  }, [])

  const handleTicketInsert = useCallback((ticket: Ticket) => {
    setTickets(prev => prev.some(t => t.id === ticket.id) ? prev : [ticket, ...prev])
  }, [])

  const handleAgentChange = useCallback((agent: Agent) => {
    setAgents(prev => prev.map(a => a.id === agent.id ? agent : a))
  }, [])

  useRealtime({
    onTicketChange: handleTicketChange,
    onTicketInsert: handleTicketInsert,
    onAgentChange: handleAgentChange,
  })

  const handleTicketUpdated = useCallback((ticket: Ticket) => {
    setTickets(prev => prev.map(t => t.id === ticket.id ? ticket : t))
    setSelectedTicket(ticket)
  }, [])

  const handleTicketCreated = useCallback((ticket: Ticket) => {
    setTickets(prev => [ticket, ...prev])
    setSelectedTicket(ticket)
  }, [])

  return (
    <div className="h-screen flex flex-col bg-surface-950 overflow-hidden">
      <Header
        usage={usage}
        onNewTicket={() => setShowCreate(true)}
        onRefresh={loadAll}
        refreshing={refreshing}
      />

      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Worker sidebar */}
        <div className="flex-shrink-0 w-60 border-r border-surface-700 p-4 overflow-y-auto bg-surface-900/30">
          <WorkerPanel
            agents={agents}
            tickets={tickets}
            onAgentClick={(agent) => {
              if (agent.currentTicketId) {
                const t = tickets.find(t => t.id === agent.currentTicketId)
                if (t) setSelectedTicket(t)
              }
            }}
          />
        </div>

        {/* Main board */}
        <div className="flex-1 p-4 overflow-hidden">
          <KanbanBoard tickets={tickets} onTicketClick={setSelectedTicket} />
        </div>
      </div>

      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          agents={agents}
          onClose={() => setSelectedTicket(null)}
          onUpdated={handleTicketUpdated}
        />
      )}

      {showCreate && (
        <CreateTicketModal
          onClose={() => setShowCreate(false)}
          onCreated={handleTicketCreated}
        />
      )}
    </div>
  )
}
