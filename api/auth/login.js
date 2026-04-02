import { createSupabaseFromRequest, applyCookies, json, error } from '../_lib/supabase-server.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return error(res, 'Method not allowed', 405)

  const { email, password } = req.body || {}
  if (!email || !password) return error(res, 'Email and password required')

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)
  const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

  if (authError) return error(res, authError.message, 401)

  applyCookies(res, cookieHeaders)
  json(res, { user: data.user })
}
