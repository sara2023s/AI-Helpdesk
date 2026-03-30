import type { VercelRequest, VercelResponse } from '@vercel/node'

const FIVE_HOUR_MS = 5 * 60 * 60 * 1000
const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const fiveHourLimit = parseInt(process.env.FIVE_HOUR_LIMIT ?? '50000')
  const sevenDayLimit = parseInt(process.env.SEVEN_DAY_LIMIT ?? '500000')
  const now = Date.now()
  const fiveHourCutoff = new Date(now - FIVE_HOUR_MS).toISOString()
  const sevenDayCutoff = new Date(now - SEVEN_DAY_MS).toISOString()

  const { data: calls } = await db
    .from('usage_calls')
    .select('tokens, created_at')
    .gte('created_at', sevenDayCutoff)
    .order('created_at', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allCalls: any[] = calls ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callsIn5Hr = allCalls.filter((c: any) => c.created_at >= fiveHourCutoff)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fiveHourTokens = callsIn5Hr.reduce((s: number, c: any) => s + (c.tokens ?? 0), 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sevenDayTokens = allCalls.reduce((s: number, c: any) => s + (c.tokens ?? 0), 0)

  const fiveHourReset = callsIn5Hr.length > 0
    ? new Date(new Date(callsIn5Hr[0].created_at).getTime() + FIVE_HOUR_MS).toISOString()
    : new Date(now + FIVE_HOUR_MS).toISOString()

  const sevenDayReset = allCalls.length > 0
    ? new Date(new Date(allCalls[0].created_at).getTime() + SEVEN_DAY_MS).toISOString()
    : new Date(now + SEVEN_DAY_MS).toISOString()

  return res.json({
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
  })
}
