import { NextRequest } from 'next/server'

const SESSION_SECRET = process.env.SESSION_SECRET ?? 'claw-license-mgr-secret-2026-v1'
const COOKIE_NAME = 'claw_session'

function computeHmacHex(value: string): string {
  const crypto = require('crypto') as typeof import('crypto')
  const hmac = crypto.createHmac('sha256', SESSION_SECRET)
  hmac.update(value)
  return hmac.digest('hex').slice(0, 16)
}

export function requireAuth(req: NextRequest): { ok: true; username: string } | { ok: false; res: Response } {
  const session = req.cookies.get(COOKIE_NAME)
  if (!session) return { ok: false, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

  const parts = session.value.split('.')
  if (parts.length !== 2) return { ok: false, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

  const [value, expectedSig] = parts
  const computed = computeHmacHex(value)
  if (computed !== expectedSig) return { ok: false, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }

  let data: { username?: string }
  try { data = JSON.parse(value) } catch { return { ok: false, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) } }

  return { ok: true, username: data.username ?? '' }
}
