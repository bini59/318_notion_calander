import { NextResponse, type NextRequest } from 'next/server'
import { SID_COOKIE, verifySid, type Verdict } from '@/lib/auth'
import { getEnv } from '@/lib/env'
import { USER_HEADER } from '@/lib/session'

// 로그인 게이트. 공개: 랜딩(/), 캘린더 앱이 쿠키 없이 읽는 /feed/*. 나머지(/setup, /api/*)는 전부 여기를 지난다.
export async function proxy(req: NextRequest) {
  const { AUTH_ORIGIN, BASE_URL, CLIENT_ID } = getEnv()
  const { pathname, search } = req.nextUrl
  const isApi = pathname.startsWith('/api/')
  const sid = req.cookies.get(SID_COOKIE)?.value

  let verdict: Verdict = { status: 401, user: null }
  if (sid) {
    try {
      verdict = await verifySid(sid)
    } catch (error) {
      console.error('auth verify failed:', error)
      return new NextResponse('auth unavailable', { status: 503 })
    }
  }

  if (verdict.status === 200 && verdict.user) {
    const headers = new Headers(req.headers)
    headers.set(USER_HEADER, verdict.user.userId) // 클라이언트가 보낸 값은 여기서 덮어쓴다
    return NextResponse.next({ request: { headers } })
  }
  if (verdict.status === 403) {
    return isApi
      ? NextResponse.json({ error: 'forbidden' }, { status: 403 })
      : new NextResponse('접근 권한이 없습니다.', { status: 403 })
  }
  // OAuth 시작/콜백은 브라우저 이동이라 JSON 401이 아니라 로그인 화면으로 보낸다.
  if (isApi && !pathname.startsWith('/api/auth/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const login = new URL(`${AUTH_ORIGIN}/login`)
  login.searchParams.set('client_id', CLIENT_ID)
  login.searchParams.set('return_to', `${BASE_URL}${pathname}${search}`) // 프록시 뒤라 req.url 대신 공개 주소
  return NextResponse.redirect(login)
}

export const config = { matcher: ['/setup/:path*', '/api/:path*'] }
