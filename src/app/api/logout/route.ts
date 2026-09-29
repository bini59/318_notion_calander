import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { SID_COOKIE, forgetSid } from '@/lib/auth'
import { getEnv } from '@/lib/env'

export const dynamic = 'force-dynamic'

// 공유 sid 세션을 auth에서 폐기(서버 간 호출). auth의 logout은 double-submit CSRF라 쿠키/헤더를 직접 맞춘다.
export async function POST(req: NextRequest) {
  const sid = req.cookies.get(SID_COOKIE)?.value
  if (sid) {
    const { AUTH_ORIGIN, CLIENT_ID } = getEnv()
    const csrf = randomBytes(16).toString('base64url')
    const res = await fetch(`${AUTH_ORIGIN}/logout?client_id=${encodeURIComponent(CLIENT_ID)}`, {
      method: 'POST',
      headers: { cookie: `${SID_COOKIE}=${sid}; csrf=${csrf}`, 'x-csrf-token': csrf },
      redirect: 'manual', // 302 = 폐기 후 앱으로 돌려보내는 정상 응답
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok && res.status !== 302) {
      return NextResponse.json({ error: `auth logout failed (${res.status})` }, { status: 502 })
    }
    forgetSid(sid)
  }
  return NextResponse.json({ ok: true })
}
