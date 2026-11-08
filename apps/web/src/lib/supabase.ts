import { createClient } from '@supabase/supabase-js'
import { config } from '@/config'

export const supabase = createClient(config.supabaseUrl || 'http://localhost:54321', config.supabaseAnonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
})

/**
 * Send a query without waiting for the result. Supabase query builders are lazy: a bare
 * `void supabase.rpc(...)` never sends anything, the request only goes out once it's awaited.
 */
export function fire(query: PromiseLike<unknown>) {
  Promise.resolve(query).then(
    (r) => { const err = (r as { error?: unknown } | null)?.error; if (err) console.warn('[supabase]', err) },
    (e) => console.warn('[supabase]', e),
  )
}

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
