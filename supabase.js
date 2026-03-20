// ============== SUPABASE CLIENT ==============
const SUPABASE_URL = 'https://vorffefuboftlcwteucu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_yqjtiUjZ8r0Mf8TOq_gGpw_el5VJ9eD';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current user state
let currentUser = null;
let currentUserRole = 'viewer';
