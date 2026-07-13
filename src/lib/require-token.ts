import { NextResponse, type NextRequest } from 'next/server'
import { readSession } from './session'
import { getDecryptedTokenByUserId } from './users'

// 3개 라우트(databases, databases/[id], calendars)가 공유하던 auth 프리앰블.
// 세션 없음 / user 행 없음(삭제·위조) 모두 재연결 유도 401로 통일. 성공 시 (userId, accessToken).
// 라우트는 `const r = requireToken(req); if (r instanceof NextResponse) return r`로 사용.
export function requireToken(
  req: NextRequest,
): { userId: string; accessToken: string } | NextResponse {
  const userId = readSession(req)
  if (!userId) return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  try {
    return { userId, accessToken: getDecryptedTokenByUserId(userId) }
  } catch {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }
}
