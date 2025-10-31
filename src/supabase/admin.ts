import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('[supabase-admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY; admin auth will return 401.');
}

export const supabaseAdmin = (url && key)
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
