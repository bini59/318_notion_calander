import { NextResponse, type NextRequest } from 'next/server'
import { getDatabaseProperties, queryRelationPages } from '@/lib/notion'
import { requireToken } from '@/lib/require-token'

// relation 필터(#16) 값 선택용 이름 드롭다운의 옵션. GET ?property=<name>.
// 신뢰경계(#5 일관): 클라가 관련 DB id를 직접 넘기지 못한다 — 선택된 DB(id)의 property를 서버가
// 재조회해 type==='relation' 확인 후 relatedDatabaseId를 서버측에서 재도출해 queryRelationPages를
// 호출한다(임의 DB 조회 차단). property 미존재/비relation → 400. Notion 실패 → 502(databases 라우트
// 패턴). 캐시 없음, Notion이 원본.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth
  const { accessToken } = auth

  const { id } = await params
  const property = req.nextUrl.searchParams.get('property')
  if (!property) {
    return NextResponse.json({ error: 'property 쿼리 파라미터가 필요합니다' }, { status: 400 })
  }

  try {
    const properties = await getDatabaseProperties(accessToken, id)
    const prop = properties.find((p) => p.name === property)
    if (!prop || prop.type !== 'relation' || !prop.relatedDatabaseId) {
      // 미존재/비relation/관련 DB 미노출 → 400으로 사용자에 표면화(삼키지 않음, 임의 DB 조회 방지).
      return NextResponse.json(
        { error: `'${property}'은(는) relation 속성이 아닙니다` },
        { status: 400 },
      )
    }
    const options = await queryRelationPages(accessToken, prop.relatedDatabaseId)
    return NextResponse.json({ options })
  } catch (error) {
    // Notion 실패(권한/네트워크/rate limit)는 상세 미노출로 502 (databases 라우트 패턴).
    console.error('Notion relation-options failed:', error)
    return NextResponse.json({ error: 'Failed to query Notion' }, { status: 502 })
  }
}
