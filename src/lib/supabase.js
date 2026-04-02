import { createBrowserClient } from '@supabase/ssr'

const SUPABASE_URL = 'https://vorffefuboftlcwteucu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_yqjtiUjZ8r0Mf8TOq_gGpw_el5VJ9eD'

export const sb = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY)
