import { NextResponse, type NextRequest } from 'next/server'
import { searchDatabases } from '@/lib/notion'
import { readSession } from '@/lib/session'
import { getDecryptedTokenByUserId } from '@/lib/users'

// 매 요청 실시간 조회 — Notion이 원본, 로컬 캐시 없음 (PLAN §4).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const userId = readSession(req)
  if (!userId) return NextResponse.json({ error: 'Not connected' }, { status: 401 })

  let accessToken: string
  try {
    accessToken = getDecryptedTokenByUserId(userId)
  } catch {
    // 세션은 있으나 user 행이 없음(삭제/위조) → 재연결 유도.
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }

  try {
    const databases = await searchDatabases(accessToken)
    return NextResponse.json({ databases })
  } catch (error) {
    // Notion 실패(권한/네트워크/rate limit)는 상세 미노출로 502 (콜백 라우트 패턴).
    console.error('Notion database search failed:', error)
    return NextResponse.json({ error: 'Failed to query Notion' }, { status: 502 })
  }
}
