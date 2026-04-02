import { createSupabaseFromRequest, applyCookies, json, error } from './_lib/supabase-server.mjs'

/**
 * RPC proxy — calls Supabase RPC functions.
 *
 * POST /api/rpc
 * Body: { fn, args? }
 */

const ALLOWED_FUNCTIONS = [
  'get_homepage_summary',
  'get_platform_historical_avg',
  'detect_metric_anomalies',
  'upsert_campaign_data_by_dates',
  'upsert_local_display_daily',
  'rollup_local_display_monthly'
]

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405)

  const { fn, args } = req.body || {}
  if (!fn) return error(res, 'fn (function name) required')
  if (!ALLOWED_FUNCTIONS.includes(fn)) return error(res, `Function "${fn}" not allowed`, 403)

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)

  try {
    const { data, error: rpcError } = await supabase.rpc(fn, args || {})

    applyCookies(res, cookieHeaders)
    if (rpcError) return error(res, rpcError.message, 400)
    json(res, { data })
  } catch (err) {
    applyCookies(res, cookieHeaders)
    error(res, err.message, 500)
  }
}
