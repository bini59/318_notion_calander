import { NextResponse, type NextRequest } from 'next/server'
import { readSession } from './session'
import { getUserByAuthId } from './users'

// 3개 라우트(databases, databases/[id], calendars)가 공유하던 auth 프리앰블.
// 로그인은 proxy가 보장(readSession = auth userId). Notion 미연결(user 행 없음)은 재연결 유도 401. 성공 시 (userId, accessToken).
// 라우트는 `const r = requireToken(req); if (r instanceof NextResponse) return r`로 사용.
export function requireToken(
  req: NextRequest,
): { userId: string; accessToken: string } | NextResponse {
  const authId = readSession(req)
  if (!authId) return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  try {
    const user = getUserByAuthId(authId)
    return { userId: user.id, accessToken: user.accessToken }
  } catch {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }
}
