import { NextRequest, NextResponse } from 'next/server'

function getUsers(): Record<string, string> {
  const raw = process.env.AUTH_USERS
  if (!raw) return {}
  const users: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const [u, p] = pair.split(':')
    if (u && p) users[u.trim()] = p.trim()
  }
  return users
}

function getSessionSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET environment variable is required')
  return s
}
const COOKIE_NAME = 'claw_session'
const SESSION_TTL = 7 * 24 * 60 * 60 // 7 days

function signSession(value: string): string {
  const crypto = require('crypto') as typeof import('crypto')
  const hmac = crypto.createHmac('sha256', getSessionSecret())
  hmac.update(value)
  return value + '.' + hmac.digest('hex').slice(0, 32)
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    const users = getUsers()
    if (!users[username] || users[username] !== password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const sessionData = JSON.stringify({ username, ts: Date.now() })
    const signed = signSession(sessionData)
    const res = NextResponse.json({ ok: true, username })
    res.cookies.set(COOKIE_NAME, signed, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL,
      path: '/',
    })
    return res
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[login] FATAL:', msg)
    return NextResponse.json({ error: 'Server error', detail: msg.slice(0, 100) }, { status: 500 })
  }
}
