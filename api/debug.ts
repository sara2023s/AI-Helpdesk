import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const result: Record<string, unknown> = {}

  // Step 1: dynamic import
  try {
    const { createClient } = await import('@supabase/supabase-js')
    result.import = 'ok'

    // Step 2: createClient
    try {
      const db = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      result.createClient = 'ok'

      // Step 3: actual query
      try {
        const { data, error } = await db.from('agents').select('id').limit(1)
        result.query = error ? `error: ${error.message}` : `ok: ${JSON.stringify(data)}`
      } catch (e) {
        result.query = `threw: ${String(e)}`
      }
    } catch (e) {
      result.createClient = `threw: ${String(e)}`
    }
  } catch (e) {
    result.import = `threw: ${String(e)}`
  }

  return res.json(result)
}
