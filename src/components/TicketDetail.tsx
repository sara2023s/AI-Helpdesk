import { useState } from 'react'
import { X, Send, Loader2, ChevronDown, ChevronUp, Zap, CheckCircle, ListTodo, ExternalLink, Monitor, PauseCircle, PlayCircle, GitBranch } from 'lucide-react'
import type { Ticket, Agent, AgentId } from '../types'
import { STATUS_CONFIG, PRIORITY_CONFIG, AGENT_CONFIG } from '../types'
import { addComment, triggerAgent, updateTicket, pauseTicket, resumeTicket, pushToGitHub } from '../api'
import { getProjectUrls } from '../config/projectUrls'

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

function formatComment(text: unknown) {
  const safe = typeof text === 'string' ? text : String(text ?? '')
  const escaped = safe
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
          {typeof comment.content === 'string' ? comment.content : '…'}
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
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-300">{comment.authorName}</span>
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
            : isTyping
              ? 'bg-amber-950/30 border border-amber-800/30 text-slate-300'
              : 'bg-surface-800 border border-surface-600 text-slate-300'
          }`}
        >
          {isTyping ? (
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="typing-dot w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
                <span className="typing-dot w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
                <span className="typing-dot w-1.5 h-1.5 bg-amber-400 rounded-full inline-block" />
              </div>
              <span className="text-xs text-amber-300/80 italic transition-all duration-500">
                {typeof comment.content === 'string' ? comment.content : '…'}
              </span>
            </div>
          ) : (
            <div className="comment-content" dangerouslySetInnerHTML={{ __html: formatComment(comment.content) }} />
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
  const [approvingPlan, setApprovingPlan] = useState(false)
  const [planExpanded, setPlanExpanded] = useState(false)
  const [actionsExpanded, setActionsExpanded] = useState(false)
  const [launchingLocal, setLaunchingLocal] = useState(false)
  const [localError, setLocalError] = useState('')
  const [pausing, setPausing] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [pushMessage, setPushMessage] = useState('')

  const statusCfg = STATUS_CONFIG[ticket.status]
  const priorityCfg = PRIORITY_CONFIG[ticket.priority]
  const assignedAgent = ticket.assignedTo ? AGENT_CONFIG[ticket.assignedTo] : null
  const projectUrls = getProjectUrls(ticket.project)
  // For "General" or unknown projects, Dev writes files to builds/<ticketId>/
  // They run on the Vite default port 5173 after: cd builds/<ticketId> && npm install && npm run dev
  const buildLocalUrl = (!projectUrls.localhost && !projectUrls.live) ? `http://localhost:5173` : null

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

  async function handleLaunchLocal() {
    setLaunchingLocal(true)
    setLocalError('')
    try {
      // Known project with a fixed localhost port — open directly
      if (projectUrls.localhost) {
        window.open(projectUrls.localhost, '_blank')
        return
      }
      // General/unknown project — ask the worker to start npm run dev
      const res = await fetch(`http://localhost:3001/start/${encodeURIComponent(ticket.id)}`, {
        method: 'POST',
        signal: AbortSignal.timeout(150_000), // 2.5 min — npm install can be slow
      })
      const data = await res.json()
      if (data.ok) {
        window.open(data.url, '_blank')
      } else {
        setLocalError(data.error ?? 'Failed to start dev server')
      }
    } catch (e: any) {
      if (e?.name === 'TimeoutError') {
        setLocalError('Dev server took too long — check the worker terminal for errors')
      } else {
        setLocalError('Worker not reachable at localhost:3001 — make sure npm run agents is running, then try again')
      }
    } finally {
      setLaunchingLocal(false)
    }
  }

  const PAUSABLE_STATUSES = new Set(['new', 'manager-review', 'awaiting_approval', 'in-progress', 'testing', 'review', 'blocked'])

  async function handlePause() {
    setPausing(true)
    try {
      const updated = await pauseTicket(ticket.id)
      onUpdated(updated)
    } catch {}
    setPausing(false)
  }

  async function handleResume() {
    setPausing(true)
    try {
      const updated = await resumeTicket(ticket.id)
      onUpdated(updated)
    } catch {}
    setPausing(false)
  }

  async function handlePush() {
    setPushing(true)
    setPushMessage('')
    try {
      const result = await pushToGitHub(ticket.id)
      setPushMessage(result.message)
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : 'Push failed')
    }
    setPushing(false)
  }

  async function handleApprovePlan() {
    if (!ticket.assignedTo) return
    setApprovingPlan(true)
    setTriggerError('')
    try {
      const updated = await updateTicket(ticket.id, { status: 'in-progress' })
      onUpdated(updated)
      await triggerAgent(ticket.id, ticket.assignedTo)
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : 'Failed to approve plan')
    }
    setApprovingPlan(false)
  }

  return (
    <div className="fixed inset-0 z-40 flex items-stretch justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl bg-surface-900 border-l border-surface-700 flex flex-col h-full shadow-2xl">

        {/* ── FIXED TOP: title + status bar ── */}
        <div className="flex-shrink-0">
          {/* Header */}
          <div className="flex items-start justify-between px-5 pt-4 pb-3 border-b border-surface-700">
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-[10px] font-mono text-slate-600">{ticket.id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusCfg.color} ${statusCfg.bg} ${statusCfg.border}`}>
                  {statusCfg.label}
                </span>
                <span className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${priorityCfg.dot}`} />
                  <span className={`text-[10px] font-medium ${priorityCfg.color}`}>{ticket.priority}</span>
                </span>
                {assignedAgent && (
                  <span className="text-[10px] text-slate-400">{assignedAgent.emoji} {assignedAgent.name}</span>
                )}
              </div>
              <h2 className="text-[15px] font-semibold text-slate-100 leading-snug">{ticket.title}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] text-slate-600">{ticket.project}</span>
                <span className="text-slate-700">·</span>
                <span className="text-[11px] text-slate-600">{ticket.type}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Local / Preview button — starts npm run dev via worker */}
              {(projectUrls.localhost || buildLocalUrl) && (
                <button
                  onClick={handleLaunchLocal}
                  disabled={launchingLocal}
                  title={projectUrls.localhost ? `Open ${projectUrls.localhost}` : `Start dev server for builds/${ticket.id}/`}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-emerald-300 border border-surface-600 hover:border-emerald-700 rounded-lg bg-surface-800 hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
                >
                  {launchingLocal
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Monitor size={11} />
                  }
                  {launchingLocal ? 'Starting…' : 'Local'}
                </button>
              )}
              {/* Live Vercel button */}
              {projectUrls.live && (
                <a
                  href={projectUrls.live}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Open live site — ${projectUrls.live}`}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-violet-300 border border-surface-600 hover:border-violet-700 rounded-lg bg-surface-800 hover:bg-violet-950/30 transition-colors"
                >
                  <ExternalLink size={11} />
                  Live
                </a>
              )}
              {/* Pause / Resume button */}
              {PAUSABLE_STATUSES.has(ticket.status) && (
                <button
                  onClick={handlePause}
                  disabled={pausing}
                  title="Pause — stops agents from picking up this ticket"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-yellow-300 border border-surface-600 hover:border-yellow-700 rounded-lg bg-surface-800 hover:bg-yellow-950/30 transition-colors disabled:opacity-50"
                >
                  {pausing ? <Loader2 size={11} className="animate-spin" /> : <PauseCircle size={11} />}
                  Pause
                </button>
              )}
              {ticket.status === 'paused' && (
                <button
                  onClick={handleResume}
                  disabled={pausing}
                  title="Resume — moves ticket back to in-progress"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-yellow-400 hover:text-green-300 border border-yellow-800 hover:border-green-700 rounded-lg bg-yellow-950/30 hover:bg-green-950/30 transition-colors disabled:opacity-50"
                >
                  {pausing ? <Loader2 size={11} className="animate-spin" /> : <PlayCircle size={11} />}
                  Resume
                </button>
              )}
              {/* Push to GitHub — shown for non-General projects in review/done status */}
              {ticket.project !== 'General' && (ticket.status === 'review' || ticket.status === 'done') && (
                <button
                  onClick={handlePush}
                  disabled={pushing}
                  title="Commit local changes and push to GitHub"
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-slate-400 hover:text-emerald-300 border border-surface-600 hover:border-emerald-700 rounded-lg bg-surface-800 hover:bg-emerald-950/30 transition-colors disabled:opacity-50"
                >
                  {pushing ? <Loader2 size={11} className="animate-spin" /> : <GitBranch size={11} />}
                  {pushing ? 'Pushing…' : 'Push to GitHub'}
                </button>
              )}
              <button onClick={onClose} className="p-1 text-slate-600 hover:text-slate-300 transition-colors rounded-lg hover:bg-surface-700 ml-1">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Status move bar */}
          <div className="px-4 py-2 border-b border-surface-700 flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider mr-1">Move to</span>
            {(['new', 'manager-review', 'awaiting_approval', 'in-progress', 'testing', 'review', 'done', 'blocked'] as const).map(s => {
              const cfg = STATUS_CONFIG[s]
              const active = ticket.status === s
              return (
                <button
                  key={s}
                  onClick={() => !active && handleStatusChange(s)}
                  disabled={active}
                  className={`text-[9px] px-2 py-0.5 rounded-full border font-medium transition-colors
                    ${active
                      ? `${cfg.color} ${cfg.bg} ${cfg.border}`
                      : 'text-slate-600 border-surface-700 hover:border-slate-500 hover:text-slate-400'
                    }`}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── SINGLE UNIFIED SCROLL ── */}
        <div className="flex-1 overflow-y-auto">

          {/* Local launch error */}
          {localError && (
            <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/40 text-[11px] text-red-300 leading-relaxed">
              ⚠️ {localError}
            </div>
          )}

          {/* Push to GitHub result */}
          {pushMessage && (
            <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-[11px] text-emerald-300 leading-relaxed">
              {pushMessage}
            </div>
          )}

          {/* Description */}
          <div className="px-5 pt-4 pb-3">
            <p className="text-xs text-slate-400 leading-relaxed">{ticket.description}</p>
          </div>

          {/* Plan — collapsible */}
          {ticket.plan && (
            <div className="mx-5 mb-3 border border-violet-800/30 rounded-xl overflow-hidden">
              <button
                onClick={() => setPlanExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-violet-950/50 hover:bg-violet-950/70 transition-colors"
              >
                <span className="text-[11px] font-semibold text-violet-300 flex items-center gap-1.5">
                  🧠 Max's Plan
                </span>
                {planExpanded
                  ? <ChevronUp size={13} className="text-violet-500" />
                  : <ChevronDown size={13} className="text-violet-500" />}
              </button>
              {planExpanded && (
                <div className="px-4 py-3 bg-violet-950/20 space-y-2">
                  {ticket.plan.split(/\s*→\s*(?=Phase\s)/i).map((phase, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-violet-500 flex-shrink-0 mt-0.5 text-xs">›</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{phase.trim()}</p>
                    </div>
                  ))}
                </div>
              )}
              {ticket.status === 'awaiting_approval' && ticket.assignedTo && (
                <button
                  onClick={handleApprovePlan}
                  disabled={approvingPlan}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                >
                  {approvingPlan
                    ? <><Loader2 size={12} className="animate-spin" /> Starting…</>
                    : <><CheckCircle size={12} /> Approve Plan — start with {AGENT_CONFIG[ticket.assignedTo]?.emoji} {AGENT_CONFIG[ticket.assignedTo]?.name}</>
                  }
                </button>
              )}
            </div>
          )}

          {/* Action items — collapsible */}
          {ticket.actionItems?.length > 0 && (
            <div className="mx-5 mb-3 border border-surface-700 rounded-xl overflow-hidden">
              <button
                onClick={() => setActionsExpanded(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 bg-surface-800/60 hover:bg-surface-700/60 transition-colors"
              >
                <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                  <ListTodo size={12} className="text-slate-500" />
                  Action Items ({ticket.actionItems.length})
                </span>
                {actionsExpanded
                  ? <ChevronUp size={13} className="text-slate-600" />
                  : <ChevronDown size={13} className="text-slate-600" />}
              </button>
              {actionsExpanded && (
                <div className="px-3 py-2 space-y-1.5">
                  {ticket.actionItems.map((item, i) => (
                    <div key={i} className="flex gap-2 text-xs text-slate-500">
                      <span className="text-violet-600 flex-shrink-0">›</span>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trigger agent */}
          <div className="mx-5 mb-4 relative">
            <button
              onClick={() => setShowTrigger(v => !v)}
              className="flex items-center gap-2 text-xs text-violet-400 hover:text-violet-300 transition-colors border border-violet-800/40 hover:border-violet-600/60 rounded-lg px-3 py-1.5 bg-violet-950/20 hover:bg-violet-950/40"
            >
              {triggeringAgent
                ? <Loader2 size={12} className="animate-spin" />
                : <Zap size={12} />
              }
              Ask an agent to work on this
              <ChevronDown size={11} className={`transition-transform ${showTrigger ? 'rotate-180' : ''}`} />
            </button>
            {showTrigger && (
              <div className="absolute top-full left-0 mt-1 bg-surface-800 border border-surface-600 rounded-xl shadow-2xl z-10 p-2 grid grid-cols-4 gap-1.5 w-80">
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
                        ${busy ? 'border-surface-700 opacity-30 cursor-not-allowed' : 'border-surface-600 hover:border-violet-600 hover:bg-violet-950/30'}`}
                    >
                      <span className="text-base">{cfg.emoji}</span>
                      <span className="text-[10px] text-slate-300 font-medium leading-none">{cfg.name}</span>
                      <span className="text-[9px] text-slate-600 leading-none">{cfg.role.split(' ')[0]}</span>
                      {busy && <span className="text-[9px] text-amber-500">busy</span>}
                    </button>
                  )
                })}
              </div>
            )}
            {triggerError && <p className="text-[11px] text-red-400 mt-1.5">{triggerError}</p>}
          </div>

          {/* ── Activity divider ── */}
          {ticket.comments.length > 0 && (
            <div className="flex items-center gap-3 px-5 mb-4">
              <div className="flex-1 border-t border-surface-700" />
              <span className="text-[9px] font-medium text-slate-600 uppercase tracking-wider">Activity</span>
              <div className="flex-1 border-t border-surface-700" />
            </div>
          )}

          {/* Comment thread — all in the same scroll */}
          <div className="px-5 pb-4 flex flex-col gap-4">
            {ticket.comments.map(c => (
              <CommentBubble key={c.id} comment={c} />
            ))}
          </div>
        </div>

        {/* ── FIXED BOTTOM: comment input ── */}
        <div className="flex-shrink-0 border-t border-surface-700 px-4 py-3 bg-surface-900">
          <div className="flex gap-2">
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment() } }}
              placeholder="Reply to agents or add context… (Enter to send)"
              rows={2}
              className="flex-1 bg-surface-800 border border-surface-700 rounded-xl px-3 py-2.5 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
            <button
              onClick={handleSendComment}
              disabled={!comment.trim() || sendingComment}
              className="px-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-30 rounded-xl text-white transition-colors flex items-center justify-center"
            >
              {sendingComment ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
