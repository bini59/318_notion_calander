import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createCalendar, listCalendarsByUser } from '@/lib/calendars'
import { mappingSchema, validateMappingAgainstProperties } from '@/lib/mapping'
import { getDatabaseProperties } from '@/lib/notion'
import { requireToken } from '@/lib/require-token'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ databaseId: z.string().min(1), mapping: mappingSchema })

// 소유자의 캘린더 목록 (이슈 #12). listCalendarsByUser가 WHERE user_id로 세션 유저 것만 반환.
export function GET(req: NextRequest) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ calendars: listCalendarsByUser(auth.userId) })
}

export async function POST(req: NextRequest) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth
  const { userId, accessToken } = auth

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'databaseId와 유효한 mapping이 필요합니다' }, { status: 400 })
  }
  const { databaseId, mapping } = parsed.data

  try {
    // 신뢰경계: 클라이언트 mapping을 그대로 믿지 않는다. Notion 속성을 서버에서 재조회해
    // (1) date 가드 (2) 매핑된 이름/타입 검증 을 모두 이 시점의 실제 스키마로 재확인한다.
    const properties = await getDatabaseProperties(accessToken, databaseId)

    // PLAN §5 필수 가드: date 속성이 하나도 없으면 무의미한 캘린더 생성 차단.
    if (!properties.some((p) => p.type === 'date')) {
      return NextResponse.json({ error: 'date 속성이 있는 DB만 캘린더로 만들 수 있습니다' }, { status: 400 })
    }

    const reason = validateMappingAgainstProperties(mapping, properties)
    if (reason) return NextResponse.json({ error: reason }, { status: 400 })

    const { id, feedUrl } = createCalendar({ userId, databaseId, mapping })
    // id는 setup이 재발급(POST /api/calendars/[id]/rotate)에 쓴다 (이슈 #8).
    return NextResponse.json({ id, feedUrl }, { status: 201 })
  } catch (error) {
    console.error('Calendar creation failed:', error)
    return NextResponse.json({ error: 'Failed to create calendar' }, { status: 502 })
  }
}
