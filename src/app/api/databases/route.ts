import { NextResponse, type NextRequest } from 'next/server'
import { searchDatabases } from '@/lib/notion'
import { requireToken } from '@/lib/require-token'

// 매 요청 실시간 조회 — Notion이 원본, 로컬 캐시 없음 (PLAN §4).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth
  const { accessToken } = auth

  try {
    const databases = await searchDatabases(accessToken)
    return NextResponse.json({ databases })
  } catch (error) {
    // Notion 실패(권한/네트워크/rate limit)는 상세 미노출로 502 (콜백 라우트 패턴).
    console.error('Notion database search failed:', error)
    return NextResponse.json({ error: 'Failed to query Notion' }, { status: 502 })
  }
}
