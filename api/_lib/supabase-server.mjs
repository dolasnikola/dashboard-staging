import { createServerClient } from '@supabase/ssr'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vorffefuboftlcwteucu.supabase.co'
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_yqjtiUjZ8r0Mf8TOq_gGpw_el5VJ9eD'

/**
 * Parse cookies from request header into { name, value } array
 */
function parseCookies(req) {
  const header = req.headers.cookie || ''
  return header.split(';').filter(Boolean).map(c => {
    const [name, ...rest] = c.trim().split('=')
    return { name, value: rest.join('=') }
  })
}

/**
 * Create a Supabase server client that reads/writes httpOnly cookies.
 * Returns { supabase, cookieHeaders } — caller must add cookieHeaders to response.
 */
export function createSupabaseFromRequest(req) {
  const cookieHeaders = []

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookies(req)
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          const parts = [`${name}=${value}`]
          parts.push(`Path=${options?.path || '/'}`)
          if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`)
          if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`)
          parts.push('HttpOnly')
          parts.push('Secure')
          parts.push(`SameSite=${options?.sameSite || 'Lax'}`)
          cookieHeaders.push(parts.join('; '))
        })
      },
    },
  })

  return { supabase, cookieHeaders }
}

/**
 * Apply cookie headers to response
 */
export function applyCookies(res, cookieHeaders) {
  cookieHeaders.forEach(cookie => {
    res.setHeader('Set-Cookie', [
      ...(Array.isArray(res.getHeader('Set-Cookie')) ? res.getHeader('Set-Cookie') : []),
      cookie
    ])
  })
}

/**
 * Send JSON response
 */
export function json(res, data, status = 200) {
  res.status(status).json(data)
}

/**
 * Send error response
 */
export function error(res, message, status = 400) {
  res.status(status).json({ error: message })
}
