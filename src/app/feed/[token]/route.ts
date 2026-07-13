import { getCalendarByFeedToken } from '@/lib/calendars'
import { eventsToIcs } from '@/lib/ics'
import { pagesToEvents } from '@/lib/events'
import { queryDatabase } from '@/lib/notion'
import { getDecryptedTokenByUserId } from '@/lib/users'

// 캘린더 앱이 구독하는 최종 출력 (이슈 #7, PLAN §3·§6). feed_token으로 캘린더를 찾아 소유자
// Notion 토큰으로 DB를 실시간 쿼리하고(저장 없음, Notion이 원본) .ics로 직렬화해 응답.
// 매 요청 실시간 조회 → 캐시 없음(PLAN §11 이후).
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params
  // Next 동적 세그먼트 [token]이 "abc.ics" 전체를 캡처 → 확장자 strip(없어도 no-op).
  const token = raw.replace(/\.ics$/, '')

  // 무효/폐기 토큰·캘린더 없음 → plain 404 (토큰/캘린더 존재 여부 노출 금지, PLAN §7).
  const calendar = getCalendarByFeedToken(token)
  if (!calendar) return new Response('Not found', { status: 404 })

  try {
    const accessToken = getDecryptedTokenByUserId(calendar.userId)
    // 전체 페이지네이션(queryDatabase가 has_more 루프) — 100개 컷 아님(notion-api 스킬).
    const pages = await queryDatabase(accessToken, calendar.databaseId)
    const ics = eventsToIcs(pagesToEvents(pages, calendar.mapping))

    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${token}.ics"`,
      },
    })
  } catch (error) {
    // Notion 실패(권한/네트워크/rate limit)·직렬화·mapping JSON 변조 → 상세 미노출 502
    // (databases 라우트 패턴). 본문에 토큰·Notion 상세 노출 금지.
    console.error('Feed generation failed:', error)
    return new Response('Failed to generate feed', { status: 502 })
  }
}
