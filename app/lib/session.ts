import { SessionOptions } from 'iron-session'

export interface SessionData {
  username?: string
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'claw-license-mgr-secret-2026-v1',
  cookieName: 'claw_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}
