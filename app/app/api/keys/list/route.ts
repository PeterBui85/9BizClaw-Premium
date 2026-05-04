import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

async function sbFetch(path: string, method = 'GET', body?: object) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const bodyStr = body ? JSON.stringify(body) : null
  const headers: Record<string, string> = {
    apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json', Prefer: 'return=minimal',
  }
  if (bodyStr) headers['Content-Length'] = String(Buffer.byteLength(bodyStr))
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: bodyStr })
  return { status: res.status, body: await res.text() }
}

export async function GET() {
  try {
    const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    if (!SB_URL || !SB_KEY) {
      const missing = { url: !!SB_URL, key: !!SB_KEY }
      console.error('[api/keys/list] Missing env vars:', missing)
      return NextResponse.json({ error: 'Supabase env missing: ' + JSON.stringify(missing) }, { status: 500 })
    }
    const [licensesRes, revokedRes] = await Promise.all([
      sbFetch('licenses?select=*&order=created_at.desc'),
      sbFetch('revoked_keys?select=*&order=revoked_at.desc'),
    ])
    let licenses: any[] = []
    let revoked: any[] = []
    try { licenses = JSON.parse(licensesRes.body) } catch { console.error('[api/keys/list] licenses parse error:', licensesRes.body) }
    try { revoked = JSON.parse(revokedRes.body) } catch { console.error('[api/keys/list] revoked parse error:', revokedRes.body) }
    return NextResponse.json({ licenses, revoked })
  } catch (err: any) {
    console.error('[api/keys/list] FATAL:', err?.message, err?.cause, String(err).slice(0, 300))
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}
