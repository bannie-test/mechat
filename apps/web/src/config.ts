/** Runtime config: Docker writes window.__ENV__ at container start; Vite env is the fallback. */
const runtime = window.__ENV__ ?? {}
const buildTime = import.meta.env as Record<string, string | undefined>

function pick(key: string): string {
  return runtime[key] || runtime[`VITE_${key}`] || buildTime[`VITE_${key}`] || ''
}

export const config = {
  supabaseUrl: pick('SUPABASE_URL'),
  supabaseAnonKey: pick('SUPABASE_ANON_KEY'),
  vapidPublicKey: pick('VAPID_PUBLIC_KEY'),
  giphyKey: pick('GIPHY_KEY'),
}
