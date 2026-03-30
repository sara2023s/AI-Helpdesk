import type { Usage } from '../types'

interface Props {
  usage: Usage | null
}

function Bar({ label, pct, used, limit, resetAt, warn }: {
  label: string; pct: number; used: number; limit: number; resetAt: string; warn: boolean
}) {
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-violet-500'

  // Show time until the oldest call in the window drops off (true reset)
  const resetDate = new Date(resetAt)
  const now = new Date()
  const diffMs = resetDate.getTime() - now.getTime()
  let resetStr: string
  if (diffMs <= 0) {
    resetStr = 'resetting…'
  } else if (diffMs < 3600000) {
    resetStr = `${Math.floor(diffMs / 60000)}m`
  } else {
    const h = Math.floor(diffMs / 3600000)
    const m = Math.floor((diffMs % 3600000) / 60000)
    resetStr = m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="flex items-center justify-between text-xs">
        <span className={warn ? 'text-amber-400 font-medium' : 'text-slate-400'}>{label}</span>
        <span className="text-slate-500 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[10px] text-slate-600">
        {(used / 1000).toFixed(1)}k / {(limit / 1000).toFixed(0)}k tok
        {diffMs > 0 && <span> · resets in {resetStr}</span>}
      </div>
    </div>
  )
}

export function UsageBars({ usage }: Props) {
  if (!usage) {
    return (
      <div className="flex gap-6">
        <div className="w-36 h-8 bg-slate-800 rounded animate-pulse" />
        <div className="w-36 h-8 bg-slate-800 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <div className="flex gap-6 items-start">
      <Bar
        label="5-hr window"
        pct={usage.fiveHour.percentage}
        used={usage.fiveHour.used}
        limit={usage.fiveHour.limit}
        resetAt={usage.fiveHour.resetAt}
        warn={usage.fiveHour.percentage >= 70}
      />
      <Bar
        label="7-day window"
        pct={usage.sevenDay.percentage}
        used={usage.sevenDay.used}
        limit={usage.sevenDay.limit}
        resetAt={usage.sevenDay.resetAt}
        warn={usage.sevenDay.percentage >= 70}
      />
    </div>
  )
}
