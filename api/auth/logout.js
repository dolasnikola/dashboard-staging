import { createSupabaseFromRequest, applyCookies, json, error } from '../_lib/supabase-server.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405)

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)
  await supabase.auth.signOut()

  applyCookies(res, cookieHeaders)
  json(res, { ok: true })
}
