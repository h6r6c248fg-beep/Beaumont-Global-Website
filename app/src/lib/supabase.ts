import { createClient } from '@supabase/supabase-js'

// Note: we deliberately don't parametrize createClient<Database>() here.
// Supabase's generated-types machinery expects relationship metadata we
// don't have without a linked project, and produces `never` types on joined
// selects. Instead we type query results explicitly at each call site using
// the domain types in `@/types/database` (e.g. `.returns<Cycle[]>()` or an
// `as` cast) — same runtime behaviour, far less generic-resolution friction.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Meridian] Supabase is not configured. Copy .env.example to .env.local and add your project URL + anon key.'
  )
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
