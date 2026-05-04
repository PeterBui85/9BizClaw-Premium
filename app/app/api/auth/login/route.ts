import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions } from '@/lib/session'

const USERS: Record<string, string> = {
  'peterbui85': '9bizclaw#3211',
}

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()
    if (!USERS[username] || USERS[username] !== password) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true, username })
    const session = await getIronSession<{ username: string }>(req, res, sessionOptions)
    session.username = username
    await session.save()
    return res
  } catch (err) {
    console.error('[login] error:', err)
    return NextResponse.json({ error: 'Server error', detail: String(err) }, { status: 500 })
  }
}
