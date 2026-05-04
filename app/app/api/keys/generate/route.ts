import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import crypto from 'crypto'

function base64urlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req)
  if (!auth.ok) return auth.res

  try {
    const { email, months, plan, machineId } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'email is required' }, { status: 400 })
    }
    if (!months || typeof months !== 'number' || months < 1 || months > 120) {
      return NextResponse.json({ error: 'months must be 1–120' }, { status: 400 })
    }

    const PRIVATE_KEY = process.env.LICENSE_PRIVATE_KEY ?? ''
    if (!PRIVATE_KEY) {
      return NextResponse.json({ error: 'LICENSE_PRIVATE_KEY not configured on server' }, { status: 500 })
    }

    const privateKey = crypto.createPrivateKey(PRIVATE_KEY)

    const now = new Date()
    const expiry = new Date(now)
    expiry.setMonth(expiry.getMonth() + months)

    const payload: Record<string, string> = {
      e: email,
      p: plan || 'premium',
      i: now.toISOString().slice(0, 10),
      v: expiry.toISOString().slice(0, 10),
    }
    if (machineId) payload.m = machineId

    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8')
    const signature = crypto.sign(null, payloadBytes, privateKey)
    const combined = Buffer.concat([payloadBytes, signature])
    const key = 'CLAW-' + base64urlEncode(combined)
    const keyHash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)

    // Insert into Supabase
    const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const body = JSON.stringify({
      key_hash: keyHash,
      payload,
    })
    const headers: Record<string, string> = {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'Content-Length': String(Buffer.byteLength(body)),
    }
    const sbRes = await fetch(`${SB_URL}/rest/v1/licenses`, {
      method: 'POST',
      headers,
      body,
    })
    const sbBody = await sbRes.text()

    if (sbRes.status !== 201 && sbRes.status !== 200) {
      console.error('[api/keys/generate] Supabase insert failed:', sbRes.status, sbBody.slice(0, 200))
      return NextResponse.json({ error: 'Failed to save license to database', detail: sbBody.slice(0, 200) }, { status: 500 })
    }

    return NextResponse.json({
      key,
      keyHash,
      email,
      plan: payload.p,
      issued: payload.i,
      expires: payload.v,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[api/keys/generate] FATAL:', msg)
    return NextResponse.json({ error: 'Server error', detail: msg.slice(0, 200) }, { status: 500 })
  }
}
