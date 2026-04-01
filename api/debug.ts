import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const result: Record<string, unknown> = {}

  // Step 1: Supabase import
  try {
    const { createClient } = await import('@supabase/supabase-js')
    result.supabase_import = 'ok'
    try {
      const db = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      result.supabase_client = 'ok'
      try {
        const { data, error } = await db.from('agents').select('id').limit(1)
        result.supabase_query = error ? `error: ${error.message}` : `ok (${(data as any[])?.length} rows)`
      } catch (e) { result.supabase_query = `threw: ${String(e)}` }
    } catch (e) { result.supabase_client = `threw: ${String(e)}` }
  } catch (e) { result.supabase_import = `threw: ${String(e)}` }

  // Step 2: Anthropic SDK import
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    result.anthropic_import = 'ok'
    result.anthropic_key_set = !!process.env.ANTHROPIC_API_KEY
    try {
      new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'test' })
      result.anthropic_client = 'ok'
    } catch (e) { result.anthropic_client = `threw: ${String(e)}` }
  } catch (e) { result.anthropic_import = `threw: ${String(e)}` }

  // Step 3: Runner import
  try {
    await import('../lib/agents/runner.js')
    result.runner_import = 'ok'
  } catch (e) { result.runner_import = `threw: ${String(e)}` }

  return res.json(result)
}
