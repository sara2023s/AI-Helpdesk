export type TicketStatus = 'new' | 'manager-review' | 'awaiting_approval' | 'in-progress' | 'testing' | 'review' | 'done' | 'blocked' | 'paused'
export type AgentId = 'manager' | 'researcher' | 'analyst' | 'brand' | 'designer' | 'developer' | 'copywriter' | 'seo' | 'devops' | 'tester' | 'reviewer' | 'sales'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'
export type TicketType = 'feature' | 'bug' | 'design' | 'content' | 'infrastructure'
export type CommentType = 'comment' | 'status-change' | 'plan' | 'question' | 'approval' | 'system' | 'typing'

export interface Comment {
  id: string
  authorId: AgentId | 'user'
  authorName: string
  content: string
  timestamp: string
  type: CommentType
}

export interface Ticket {
  id: string
  title: string
  description: string
  type: TicketType
  priority: Priority
  project: string
  status: TicketStatus
  assignedTo: AgentId | null
  plan: string | null
  actionItems: string[]
  tags: string[]
  comments: Comment[]
  createdAt: string
  updatedAt: string
}

export interface Agent {
  id: AgentId
  name: string
  role: string
  emoji: string
  color: string
  status: 'idle' | 'busy' | 'offline'
  currentTicketId: string | null
  lastActiveAt: string | null
}

export interface UsageWindow {
  used: number
  limit: number
  percentage: number
  resetAt: string
  remaining: number
}

export interface Usage {
  fiveHour: UsageWindow
  sevenDay: UsageWindow
}

export const STATUS_CONFIG: Record<TicketStatus, { label: string; color: string; bg: string; border: string }> = {
  'new':               { label: 'New',              color: 'text-slate-300',  bg: 'bg-slate-800',    border: 'border-slate-600'  },
  'manager-review':    { label: 'Manager Review',   color: 'text-amber-300',  bg: 'bg-amber-950',    border: 'border-amber-700'  },
  'awaiting_approval': { label: 'Awaiting Approval',color: 'text-violet-300', bg: 'bg-violet-950',   border: 'border-violet-700' },
  'in-progress':       { label: 'In Progress',      color: 'text-blue-300',   bg: 'bg-blue-950',     border: 'border-blue-700'   },
  'testing':           { label: 'Testing',          color: 'text-purple-300', bg: 'bg-purple-950',   border: 'border-purple-700' },
  'review':            { label: 'Review',           color: 'text-orange-300', bg: 'bg-orange-950',   border: 'border-orange-700' },
  'done':              { label: 'Done',             color: 'text-green-300',  bg: 'bg-green-950',    border: 'border-green-700'  },
  'blocked':           { label: 'Blocked',          color: 'text-red-300',    bg: 'bg-red-950',      border: 'border-red-700'    },
  'paused':            { label: 'Paused',           color: 'text-yellow-300', bg: 'bg-yellow-950',   border: 'border-yellow-700' },
}

export const PRIORITY_CONFIG: Record<Priority, { color: string; dot: string }> = {
  P0: { color: 'text-red-400',    dot: 'bg-red-500'    },
  P1: { color: 'text-orange-400', dot: 'bg-orange-500' },
  P2: { color: 'text-blue-400',   dot: 'bg-blue-500'   },
  P3: { color: 'text-slate-400',  dot: 'bg-slate-500'  },
}

export const AGENT_CONFIG: Record<AgentId, { emoji: string; color: string; name: string; role: string }> = {
  manager:    { emoji: '🧠', color: '#7c3aed', name: 'Max',   role: 'Project Manager'    },
  researcher: { emoji: '🔭', color: '#0f766e', name: 'Scout', role: 'Market Researcher'  },
  analyst:    { emoji: '📊', color: '#0369a1', name: 'Sam',   role: 'Business Analyst'   },
  brand:      { emoji: '🎯', color: '#6d28d9', name: 'Blake', role: 'Brand Strategist'   },
  designer:   { emoji: '🎨', color: '#db2777', name: 'Aria',  role: 'UI/UX Designer'     },
  developer:  { emoji: '💻', color: '#0891b2', name: 'Dev',   role: 'Developer'          },
  copywriter: { emoji: '✍️', color: '#059669', name: 'Kai',   role: 'Copywriter'         },
  seo:        { emoji: '📈', color: '#15803d', name: 'Sage',  role: 'SEO Specialist'     },
  devops:     { emoji: '⚙️', color: '#c2410c', name: 'Rex',   role: 'DevOps Engineer'    },
  tester:     { emoji: '🧪', color: '#9333ea', name: 'Quinn', role: 'QA Tester'          },
  reviewer:   { emoji: '🔍', color: '#b45309', name: 'Ray',   role: 'Code Reviewer'      },
  sales:      { emoji: '💼', color: '#be123c', name: 'Nova',  role: 'Proposals & Sales'  },
}

export const KANBAN_COLUMNS: TicketStatus[] = [
  'new', 'manager-review', 'awaiting_approval', 'in-progress', 'testing', 'review', 'done', 'blocked', 'paused'
]
