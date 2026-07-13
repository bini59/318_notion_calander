import { NextResponse, type NextRequest } from 'next/server'
import { getDatabaseProperties } from '@/lib/notion'
import { requireToken } from '@/lib/require-token'

// 선택된 DB의 속성 목록 — 매핑 UI가 필드를 고르기 위해 필요. Notion이 원본, 캐시 없음 (PLAN §4).
// ponytail: N+1 회피 — 전체 DB 일괄 조회 금지, 사용자가 고른 DB 하나만 이 시점에 1회 retrieve.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth
  const { accessToken } = auth

  const { id } = await params

  try {
    const properties = await getDatabaseProperties(accessToken, id)
    return NextResponse.json({ properties })
  } catch (error) {
    // Notion 실패(권한/네트워크/rate limit)는 상세 미노출로 502 (databases 라우트 패턴).
    console.error('Notion database retrieve failed:', error)
    return NextResponse.json({ error: 'Failed to query Notion' }, { status: 502 })
  }
}
