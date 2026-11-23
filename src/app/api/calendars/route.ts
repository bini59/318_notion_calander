import { requestMessages } from '@/lib/i18n-server'
import { serverErrorMessage } from '@/lib/server-error-message'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createCalendar, listCalendarsByUser } from '@/lib/calendars'
import { mappingSchema, mappingValidationIssue } from '@/lib/mapping'
import { getDatabaseProperties } from '@/lib/notion'
import { requireToken } from '@/lib/require-token'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  databaseId: z.string().min(1),
  mapping: mappingSchema,
  // 표시 라벨(X-WR-CALNAME)일 뿐 신뢰경계 아님 — trim/max만. 빈 값은 lib가 폴백.
  name: z.string().trim().max(200).optional(),
})

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

  const messages = requestMessages(req.headers)
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: messages.invalidMapping, code: 'INVALID_MAPPING' }, { status: 400 })
  }
  const { databaseId, mapping, name } = parsed.data

  try {
    // 신뢰경계: 클라이언트 mapping을 그대로 믿지 않는다. Notion 속성을 서버에서 재조회해
    // (1) date 가드 (2) 매핑된 이름/타입 검증 을 모두 이 시점의 실제 스키마로 재확인한다.
    const properties = await getDatabaseProperties(accessToken, databaseId)

    // PLAN §5 필수 가드: date 속성이 하나도 없으면 무의미한 캘린더 생성 차단.
    if (!properties.some((p) => p.type === 'date')) {
      return NextResponse.json({ error: messages.datePropertyRequired, code: 'DATE_PROPERTY_REQUIRED' }, { status: 400 })
    }

    const issue = mappingValidationIssue(mapping, properties)
    if (issue) {
      const error = serverErrorMessage(issue, messages.invalidMapping, (key) => messages[key])
      return NextResponse.json({ ...issue, error }, { status: 400 })
    }

    const { id, feedUrl, name: savedName } = createCalendar({ userId, databaseId, mapping, name })
    // id는 setup이 재발급(POST /api/calendars/[id]/rotate)에 쓴다 (이슈 #8).
    return NextResponse.json({ id, feedUrl, name: savedName }, { status: 201 })
  } catch (error) {
    console.error('Calendar creation failed:', error)
    return NextResponse.json({ error: messages.couldNotCreateTheCalendar }, { status: 502 })
  }
}
