import { createSupabaseFromRequest, applyCookies, json, error } from '../_lib/supabase-server.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405)

  const { password } = req.body || {}
  if (!password) return error(res, 'Password required')

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)
  const { data, error: authError } = await supabase.auth.updateUser({ password })

  if (authError) return error(res, authError.message, 400)

  applyCookies(res, cookieHeaders)
  json(res, { user: data.user })
}
