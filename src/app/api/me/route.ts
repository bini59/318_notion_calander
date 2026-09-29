import { NextResponse, type NextRequest } from 'next/server'
import { SID_COOKIE, verifySid } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// AppShell 프로필용. proxy가 이미 통과시킨 요청이라 verifySid는 캐시 히트.
export async function GET(req: NextRequest) {
  const sid = req.cookies.get(SID_COOKIE)?.value
  const { user } = sid ? await verifySid(sid) : { user: null }
  return user ? NextResponse.json(user) : NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}
