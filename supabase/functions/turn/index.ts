// ICE servers for WebRTC calls. Deploy with "Enforce JWT verification" ON (signed-in users only).
// Always returns free STUN servers. If Cloudflare TURN secrets are set, also returns short-lived
// TURN relay credentials, which are needed when both people are behind strict NATs
// (some mobile carriers, office Wi-Fi). Secrets: TURN_KEY_ID, TURN_KEY_API_TOKEN.
const KEY_ID = Deno.env.get('TURN_KEY_ID') ?? ''
const KEY_TOKEN = Deno.env.get('TURN_KEY_API_TOKEN') ?? ''

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

interface IceServer { urls: string | string[]; username?: string; credential?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!KEY_ID || !KEY_TOKEN) return Response.json({ iceServers: STUN }, { headers: cors })
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
    })
    if (!res.ok) throw new Error(`TURN API ${res.status}: ${await res.text()}`)
    const body = await res.json()
    const list: IceServer[] = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers]
    // Browsers stall on port 53, so drop those URLs.
    const iceServers = list.map((s) => ({
      ...s,
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)),
    }))
    return Response.json({ iceServers }, { headers: cors })
  } catch (err) {
    console.error(err)
    return Response.json({ iceServers: STUN }, { headers: cors })
  }
})
