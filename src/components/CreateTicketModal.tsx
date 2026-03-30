import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createTicket } from '../api'
import type { Ticket } from '../types'

interface Props {
  onClose: () => void
  onCreated: (ticket: Ticket) => void
}

const PROJECTS = ['Soul2Soul', 'ABCWebsite', 'Shopify', 'General']
const TYPES = [
  { value: 'feature',        label: '✨ Feature'        },
  { value: 'bug',            label: '🐛 Bug Fix'        },
  { value: 'design',         label: '🎨 Design'         },
  { value: 'content',        label: '✍️ Content'        },
  { value: 'infrastructure', label: '⚙️ Infrastructure' },
]
const PRIORITIES = [
  { value: 'P0', label: '🔴 P0 — Critical' },
  { value: 'P1', label: '🟠 P1 — High'     },
  { value: 'P2', label: '🔵 P2 — Medium'   },
  { value: 'P3', label: '⚪ P3 — Low'      },
]

export function CreateTicketModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    type: 'feature',
    priority: 'P2',
    project: 'General',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) {
      setError('Title and description are required.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const ticket = await createTicket(form)
      onCreated(ticket)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Create Ticket</h2>
            <p className="text-xs text-slate-500 mt-0.5">Max 🧠 will review and assign automatically</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Title *</label>
            <input
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Short, descriptive title..."
              className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Description *</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Describe what needs to be done, any relevant context, links, or requirements..."
              rows={4}
              className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-violet-500 transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={e => set('type', e.target.value)}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-slate-100
                  focus:outline-none focus:border-violet-500 transition-colors"
              >
                {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-slate-100
                  focus:outline-none focus:border-violet-500 transition-colors"
              >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Project</label>
            <select
              value={form.project}
              onChange={e => set('project', e.target.value)}
              className="w-full bg-surface-900 border border-surface-600 rounded-lg px-3 py-2.5 text-sm text-slate-100
                focus:outline-none focus:border-violet-500 transition-colors"
            >
              {PROJECTS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm text-slate-400 border border-surface-600 rounded-lg
                hover:border-slate-500 hover:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-violet-600 rounded-lg
                hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={14} className="animate-spin" /> Creating...</> : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
