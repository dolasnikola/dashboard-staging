import { createServerClient } from '@supabase/ssr'

export default async function handler(req, res) {
  const code = req.query.code
  if (!code) {
    return res.redirect('/')
  }

  const supabase = createServerClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return Object.entries(req.cookies || {}).map(([name, value]) => ({ name, value }))
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookie(name, value, {
              ...options,
              httpOnly: true,
              secure: true,
              sameSite: 'lax'
            })
          })
        },
      },
    }
  )

  await supabase.auth.exchangeCodeForSession(code)
  res.redirect('/')
}
