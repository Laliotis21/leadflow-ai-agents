const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;

// Server-side only: the service-role key bypasses RLS, so the tables can stay
// locked down against the public anon key. SUPABASE_ANON_KEY is kept as a
// fallback so an existing deploy keeps working until the key is swapped.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;
const supabaseKey = serviceRoleKey || anonKey;

if (!serviceRoleKey && anonKey) {
  console.warn(
    '[supabase] using SUPABASE_ANON_KEY — set SUPABASE_SERVICE_ROLE_KEY and lock RLS (see sql/rls.sql)'
  );
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

module.exports = {
  supabase,
  isSupabaseConfigured: !!(supabaseUrl && supabaseKey),
  isServiceRole: !!serviceRoleKey,
};
