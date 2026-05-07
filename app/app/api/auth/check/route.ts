import { NextRequest, NextResponse } from 'next/server'

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

export async function GET(req: NextRequest) {
  try {
    const session = req.cookies.get(COOKIE_NAME)
    if (!session) return NextResponse.json({ ok: false }, { status: 401 })

    const dotIdx = session.value.lastIndexOf('.')
    if (dotIdx < 1) return NextResponse.json({ ok: false }, { status: 401 })

    const value = session.value.slice(0, dotIdx)
    const expectedSig = session.value.slice(dotIdx + 1)
    const computed = computeHmacHex(value)
    if (computed !== expectedSig) return NextResponse.json({ ok: false }, { status: 401 })

    let data: any
    try { data = JSON.parse(value) } catch { return NextResponse.json({ ok: false }, { status: 401 }) }

    if (data.ts && (Date.now() - data.ts) > SESSION_TTL) return NextResponse.json({ ok: false }, { status: 401 })

    return NextResponse.json({ ok: true, username: data.username })
  } catch (err) {
    console.error('[auth/check]', err)
    return NextResponse.json({ ok: false }, { status: 401 })
  }
}
