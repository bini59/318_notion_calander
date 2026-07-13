import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'
import { STATE_COOKIE, buildAuthUrl } from '@/lib/notion-oauth'

// OAuth 시작은 매 요청 새 state가 필요 — 정적 최적화 금지.
export const dynamic = 'force-dynamic'

export function GET() {
  const state = randomBytes(32).toString('base64url')
  const res = NextResponse.redirect(buildAuthUrl(state))
  // CSRF state는 DB가 아닌 httpOnly 쿠키에 (stateless). 콜백에서 대조 후 삭제.
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: getEnv().BASE_URL.startsWith('https'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600, // 10분 — OAuth 왕복이면 충분
  })
  return res
}
