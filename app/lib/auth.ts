import { NextRequest } from 'next/server'

function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET environment variable is required')
  return s
}
const COOKIE_NAME = 'claw_session'

function computeHmacHex(value: string): string {
  const crypto = require('crypto') as typeof import('crypto')
  const hmac = crypto.createHmac('sha256', getSessionSecret())
  hmac.update(value)
  return hmac.digest('hex').slice(0, 32)
}

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000

export function requireAuth(req: NextRequest): { ok: true; username: string } | { ok: false; res: Response } {
  const unauth = () => ({ ok: false as const, res: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) })

  const session = req.cookies.get(COOKIE_NAME)
  if (!session) return unauth()

  const dotIdx = session.value.lastIndexOf('.')
  if (dotIdx < 1) return unauth()

  const value = session.value.slice(0, dotIdx)
  const expectedSig = session.value.slice(dotIdx + 1)
  const computed = computeHmacHex(value)
  if (computed !== expectedSig) return unauth()

  let data: { username?: string; ts?: number }
  try { data = JSON.parse(value) } catch { return unauth() }

  if (data.ts && (Date.now() - data.ts) > SESSION_TTL) return unauth()

  return { ok: true, username: data.username ?? '' }
}
