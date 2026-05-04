import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/session'

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.pathname

  // Public paths — allow without session check
  if (
    url === '/' ||
    url.startsWith('/api/auth/login') ||
    url.startsWith('/api/auth/logout') ||
    url.startsWith('/_next') ||
    url.startsWith('/favicon') ||
    url.includes('.')
  ) {
    return NextResponse.next()
  }

  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)

  if (!session.username) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!api/auth/login|api/auth/logout|_next/static|_next/image|favicon.ico).*)'],
}
