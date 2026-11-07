import { createClient } from '@supabase/supabase-js'
import { config } from '@/config'

export const supabase = createClient(config.supabaseUrl || 'http://localhost:54321', config.supabaseAnonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 20 } },
})

export const isConfigured = Boolean(config.supabaseUrl && config.supabaseAnonKey)
