import { useState } from 'react'
import { X, Send, Loader2, ChevronDown, Zap } from 'lucide-react'
import type { Ticket, Agent, AgentId } from '../types'
import { STATUS_CONFIG, PRIORITY_CONFIG, AGENT_CONFIG } from '../types'
import { addComment, triggerAgent, updateTicket } from '../api'

interface Props {
  ticket: Ticket
  agents: Agent[]
  onClose: () => void
  onUpdated: (ticket: Ticket) => void
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

function formatComment(text: string) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-slate-200">$1</strong>')
    .replace(/\n/g, '<br/>')
}

function CommentBubble({ comment }: { comment: Ticket['comments'][0] }) {
  const isUser = comment.authorId === 'user'
  const isTyping = comment.type === 'typing'
  const isSystem = comment.type === 'system'
  const agentCfg = !isUser ? AGENT_CONFIG[comment.authorId as AgentId] : null

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] text-slate-600 bg-surface-800 px-3 py-1 rounded-full border border-surface-700">
          {comment.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0 mt-0.5"
        style={agentCfg ? { backgroundColor: agentCfg.color + '22', border: `1px solid ${agentCfg.color}44` } : {}}
      >
        {isUser ? '👤' : agentCfg?.emoji ?? '🤖'}
      </div>

      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-slate-400">{comment.authorName}</span>
          <span className="text-[10px] text-slate-600">{timeAgo(comment.timestamp)}</span>
          {comment.type === 'plan' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-violet-900/50 text-violet-400 border border-violet-800 rounded">plan</span>
          )}
          {comment.type === 'question' && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-900/50 text-amber-400 border border-amber-800 rounded">needs info</span>
          )}
        </div>

        <div className={`px-3 py-2.5 rounded-xl text-sm leading-relaxed
          ${isUser
            ? 'bg-violet-700/30 border border-violet-600/50 text-slate-200'
            : 'bg-surface-800 border border-surface-600 text-slate-300'
          }`}
        >
          {isTyping ? (
            <div className="flex items-center gap-1 py-0.5">
              <span className="typing-dot w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
              <span className="typing-dot w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
              <span className="typing-dot w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
            </div>
          ) : (
            <div
              className="comment-content"
              dangerouslySetInnerHTML={{ __html: formatComment(comment.content) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

const AGENT_IDS: AgentId[] = [
  'manager', 'researcher', 'analyst', 'brand',
  'designer', 'developer', 'copywriter', 'seo',
  'devops', 'tester', 'reviewer', 'sales',
]

export function TicketDetail({ ticket, agents, onClose, onUpdated }: Props) {
  const [comment, setComment] = useState('')
  const [sendingComment, setSendingComment] = useState(false)
  const [triggeringAgent, setTriggeringAgent] = useState<AgentId | null>(null)
  const [triggerError, setTriggerError] = useState('')
  const [showTrigger, setShowTrigger] = useState(false)

  const statusCfg = STATUS_CONFIG[ticket.status]
  const priorityCfg = PRIORITY_CONFIG[ticket.priority]
  const assignedAgent = ticket.assignedTo ? AGENT_CONFIG[ticket.assignedTo] : null

  async function handleSendComment() {
    if (!comment.trim()) return
    setSendingComment(true)
    try {
      const updated = await addComment(ticket.id, comment)
      onUpdated(updated)
      setComment('')
    } catch {}
    setSendingComment(false)
  }

  async function handleTrigger(agentId: AgentId) {
    setTriggeringAgent(agentId)
    setTriggerError('')
    setShowTrigger(false)
    try {
      await triggerAgent(ticket.id, agentId)
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Failed to trigger agent')
    }
    setTriggeringAgent(null)
  }

  async function handleStatusChange(newStatus: string) {
    const updated = await updateTicket(ticket.id, { status: newStatus as Ticket['status'] })
    onUpdated(updated)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-surface-900 border-l border-surface-700 flex flex-col h-full shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-surface-700 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-500">{ticket.id}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                {statusCfg.label}
              </span>
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                <span className={`text-[10px] font-medium ${priorityCfg.color}`}>{ticket.priority}</span>
              </span>
            </div>
            <h2 className="text-base font-semibold text-slate-100 leading-snug">{ticket.title}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-slate-500">{ticket.project}</span>
              <span className="text-xs text-slate-500">·</span>
              <span className="text-xs text-slate-500">{ticket.type}</span>
              {assignedAgent && (
                <>
                  <span className="text-xs text-slate-500">·</span>
                  <span className="text-xs text-slate-400">{assignedAgent.emoji} {assignedAgent.name}</span>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Status change bar */}
        <div className="px-5 py-2 border-b border-surface-700 flex items-center gap-2 flex-shrink-0 flex-wrap">
          <span className="text-[10px] text-slate-500">Move to:</span>
          <div className="flex gap-1 flex-wrap">
            {(['new', 'manager-review', 'in-progress', 'testing', 'review', 'done', 'blocked'] as const).map(s => {
              const cfg = STATUS_CONFIG[s]
              const active = ticket.status === s
              return (
                <button
                  key={s}
                  onClick={() => !active && handleStatusChange(s)}
                  disabled={active}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors
                    ${active ? `${cfg.color} ${cfg.bg} ${cfg.border}` : 'text-slate-600 border-surface-700 hover:border-slate-500 hover:text-slate-400'}`}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Description + plan */}
        <div className="px-5 py-3 border-b border-surface-700 flex-shrink-0">
          <p className="text-xs text-slate-400 leading-relaxed">{ticket.description}</p>
          {ticket.plan && (
            <div className="mt-2 p-3 bg-violet-950/30 border border-violet-800/30 rounded-lg">
              <div className="text-[10px] font-semibold text-violet-400 mb-1">Max's Plan</div>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-wrap">{ticket.plan}</p>
            </div>
          )}
          {ticket.actionItems?.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] font-semibold text-slate-500 mb-1">Action Items</div>
              <ul className="space-y-0.5">
                {ticket.actionItems.map((item, i) => (
                  <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                    <span className="text-violet-500 flex-shrink-0">›</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Trigger agent */}
        <div className="px-5 py-2 border-b border-surface-700 flex-shrink-0">
          <div className="relative">
            <button
              onClick={() => setShowTrigger(v => !v)}
              className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors border border-violet-800/50 hover:border-violet-600 rounded-lg px-3 py-1.5"
            >
              <Zap size={12} />
              Ask an agent to work on this
              <ChevronDown size={12} className={showTrigger ? 'rotate-180' : ''} />
            </button>
            {showTrigger && (
              <div className="absolute top-full left-0 mt-1 bg-surface-800 border border-surface-600 rounded-xl shadow-xl z-10 p-2 grid grid-cols-4 gap-1.5 w-96">
                {AGENT_IDS.map(agentId => {
                  const cfg = AGENT_CONFIG[agentId]
                  const agent = agents.find(a => a.id === agentId)
                  const busy = agent?.status === 'busy'
                  return (
                    <button
                      key={agentId}
                      onClick={() => handleTrigger(agentId)}
                      disabled={busy || triggeringAgent !== null}
                      className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border transition-colors text-center
                        ${busy ? 'border-surface-600 opacity-40 cursor-not-allowed' : 'border-surface-600 hover:border-violet-600 hover:bg-violet-950/20'}`}
                    >
                      <span className="text-base">{cfg.emoji}</span>
                      <span className="text-[10px] text-slate-300 font-medium leading-none">{cfg.name}</span>
                      <span className="text-[9px] text-slate-600 leading-none">{cfg.role.split(' ')[0]}</span>
                      {triggeringAgent === agentId && <Loader2 size={10} className="animate-spin text-violet-400" />}
                      {busy && <span className="text-[9px] text-amber-500">busy</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          {triggerError && <p className="text-xs text-red-400 mt-1">{triggerError}</p>}
        </div>

        {/* Comment thread */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {ticket.comments.map(c => (
            <CommentBubble key={c.id} comment={c} />
          ))}
        </div>

        {/* Comment input */}
        <div className="px-5 py-4 border-t border-surface-700 flex-shrink-0">
          <div className="flex gap-2">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment() } }}
              placeholder="Add a comment or reply to agents… (Enter to send)"
              rows={2}
              className="flex-1 bg-surface-800 border border-surface-600 rounded-xl px-3 py-2.5 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
            <button
              onClick={handleSendComment}
              disabled={!comment.trim() || sendingComment}
              className="px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 rounded-xl
                text-white transition-colors flex items-center justify-center"
            >
              {sendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
