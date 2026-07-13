import { NextResponse, type NextRequest } from 'next/server'
import { getEnv } from '@/lib/env'
import { STATE_COOKIE, exchangeCodeForToken } from '@/lib/notion-oauth'
import { upsertUserByWorkspace } from '@/lib/users'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const base = getEnv().BASE_URL
  const { searchParams } = req.nextUrl

  // (1) 사용자가 Notion 동의 화면에서 거부
  if (searchParams.get('error')) {
    return NextResponse.redirect(`${base}/?notion=denied`)
  }

  // (2) CSRF: 쿼리 state ↔ 쿠키 state. 누락/불일치는 절대 통과시키지 않는다 (PLAN §7).
  const state = searchParams.get('state')
  const cookieState = req.cookies.get(STATE_COOKIE)?.value
  if (!state || !cookieState || state !== cookieState) {
    return new NextResponse('Invalid OAuth state', { status: 400 })
  }

  const code = searchParams.get('code')
  if (!code) {
    return new NextResponse('Missing authorization code', { status: 400 })
  }

  // (3) code→token 교환 + 암호화 저장. 실패는 사용자향 에러로 변환(상세 미노출).
  try {
    const { accessToken, workspaceId } = await exchangeCodeForToken(code)
    upsertUserByWorkspace({ accessToken, workspaceId })
  } catch (error) {
    console.error('Notion OAuth callback failed:', error)
    return new NextResponse('Notion connection failed', { status: 502 })
  }

  // (4) 성공 → state 쿠키 삭제 후 완료 리다이렉트
  const res = NextResponse.redirect(`${base}/?notion=connected`)
  res.cookies.delete(STATE_COOKIE)
  return res
}
