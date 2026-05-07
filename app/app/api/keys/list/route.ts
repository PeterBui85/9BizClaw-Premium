import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function sbFetch(path: string, method = 'GET', body?: object) {
  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const bodyStr = body ? JSON.stringify(body) : null
  const headers: Record<string, string> = {
    apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
    'Content-Type': 'application/json',
  }
  if (method !== 'GET') headers['Prefer'] = 'return=minimal'
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: bodyStr, cache: 'no-store' })
  return { status: res.status, body: await res.text() }
}

export async function GET(req: NextRequest) {
  const auth = requireAuth(req)
  if (!auth.ok) return auth.res

  try {
    const [licensesRes, activationsRes, revokedRes] = await Promise.all([
      sbFetch('licenses?select=*&order=created_at.desc'),
      sbFetch('activations?select=*'),
      sbFetch('revoked_keys?select=*&order=revoked_at.desc'),
    ])
    let licenses: any[] = []
    let activations: any[] = []
    let revoked: any[] = []
    try { licenses = JSON.parse(licensesRes.body) } catch { console.error('[api/keys/list] licenses parse error:', licensesRes.body) }
    try { activations = JSON.parse(activationsRes.body) } catch { console.error('[api/keys/list] activations parse error:', activationsRes.body) }
    try { revoked = JSON.parse(revokedRes.body) } catch { console.error('[api/keys/list] revoked parse error:', revokedRes.body) }
    const actMap: Record<string, any> = {}
    for (const a of activations) { if (a.key_hash) actMap[a.key_hash] = a }
    for (const lic of licenses) { lic.activation = actMap[lic.key_hash] || null }
    const resp = NextResponse.json({
      licenses, revoked,
      _debug: {
        ts: new Date().toISOString(),
        licensesStatus: licensesRes.status,
        activationsStatus: activationsRes.status,
        revokedStatus: revokedRes.status,
        licensesCount: licenses.length,
        revokedCount: revoked.length,
      },
    })
    resp.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return resp
  } catch (err: any) {
    console.error('[api/keys/list] FATAL:', err?.message, String(err).slice(0, 300))
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }
}
