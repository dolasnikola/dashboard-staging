import { createSupabaseFromRequest, applyCookies, json } from '../_lib/supabase-server.mjs'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { supabase, cookieHeaders } = createSupabaseFromRequest(req)
  const { data: { user }, error } = await supabase.auth.getUser()

  applyCookies(res, cookieHeaders)

  if (error || !user) return json(res, { user: null })
  json(res, { user })
}
