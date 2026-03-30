import { supabase } from './supabase'

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000

export async function recordTokenUsage(tokens: number, agentId: string): Promise<void> {
  await supabase.from('usage_calls').insert({ agent_id: agentId, tokens })
  // Clean up records older than 7 days
  const cutoff = new Date(Date.now() - SEVEN_DAY_MS).toISOString()
  await supabase.from('usage_calls').delete().lt('created_at', cutoff)
}

export async function getWindowUsage() {
  const now = Date.now()
  const fiveHourCutoff = new Date(now - FIVE_HOUR_MS).toISOString()
  const sevenDayCutoff = new Date(now - SEVEN_DAY_MS).toISOString()

  const fiveHourLimit = parseInt(process.env.FIVE_HOUR_LIMIT ?? '50000')
  const sevenDayLimit = parseInt(process.env.SEVEN_DAY_LIMIT ?? '500000')

  // Fetch all calls within the 7-day window (covers both windows)
  const { data: calls } = await supabase
    .from('usage_calls')
    .select('tokens, created_at')
    .gte('created_at', sevenDayCutoff)
    .order('created_at', { ascending: true })

  const allCalls = calls ?? []
  const callsIn5Hr = allCalls.filter(c => c.created_at >= fiveHourCutoff)

  const fiveHourTokens = callsIn5Hr.reduce((s, c) => s + (c.tokens ?? 0), 0)
  const sevenDayTokens = allCalls.reduce((s, c) => s + (c.tokens ?? 0), 0)

  // Reset time = when the OLDEST call in each window will drop off
  // This is when usage starts decreasing, i.e. true window reset for the current load
  const fiveHourReset = callsIn5Hr.length > 0
    ? new Date(new Date(callsIn5Hr[0].created_at).getTime() + FIVE_HOUR_MS).toISOString()
    : new Date(now + FIVE_HOUR_MS).toISOString()

  const sevenDayReset = allCalls.length > 0
    ? new Date(new Date(allCalls[0].created_at).getTime() + SEVEN_DAY_MS).toISOString()
    : new Date(now + SEVEN_DAY_MS).toISOString()

  return {
    fiveHour: {
      used: fiveHourTokens,
      limit: fiveHourLimit,
      percentage: Math.min(100, Math.round((fiveHourTokens / fiveHourLimit) * 100)),
      resetAt: fiveHourReset,
      remaining: Math.max(0, fiveHourLimit - fiveHourTokens),
    },
    sevenDay: {
      used: sevenDayTokens,
      limit: sevenDayLimit,
      percentage: Math.min(100, Math.round((sevenDayTokens / sevenDayLimit) * 100)),
      resetAt: sevenDayReset,
      remaining: Math.max(0, sevenDayLimit - sevenDayTokens),
    },
  }
}

export async function isCapacityAvailable(): Promise<boolean> {
  const w = await getWindowUsage()
  return w.fiveHour.remaining > 1000 && w.sevenDay.remaining > 1000
}
