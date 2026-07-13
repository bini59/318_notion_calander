import { getCalendarByFeedToken } from '@/lib/calendars'
import { getCachedFeed, setCachedFeed } from '@/lib/feed-cache'
import { eventsToIcs } from '@/lib/ics'
import { pagesToEvents } from '@/lib/events'
import { buildNotionFilter, queryDatabase } from '@/lib/notion'
import { getDecryptedTokenByUserId } from '@/lib/users'

// 캘린더 앱이 구독하는 최종 출력 (이슈 #7, PLAN §3·§6). feed_token으로 캘린더를 찾아 소유자
// Notion 토큰으로 DB를 실시간 쿼리하고(저장 없음, Notion이 원본) .ics로 직렬화해 응답.
// 매 요청 실시간 조회하되 성공 .ics는 5분 인메모리 캐시로 흡수해 Notion rate limit 완화(#11, PLAN §11).
export const dynamic = 'force-dynamic'

const icsResponse = (ics: string, token: string) =>
  new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${token}.ics"`,
    },
  })

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params
  // Next 동적 세그먼트 [token]이 "abc.ics" 전체를 캡처 → 확장자 strip(없어도 no-op).
  const token = raw.replace(/\.ics$/, '')

  // 무효/폐기 토큰·캘린더 없음 → plain 404 (토큰/캘린더 존재 여부 노출 금지, PLAN §7).
  // 캐시 조회는 404 체크 뒤에 둔다 — 무효 토큰은 여기서 404로 빠지므로 절대 캐시되지 않는다.
  const calendar = getCalendarByFeedToken(token)
  if (!calendar) return new Response('Not found', { status: 404 })

  // 캐시 히트면 Notion 미조회로 즉시 응답(rate limit 흡수). rotate 시 옛 토큰은 invalidate됨(#8).
  // ponytail: miss 시 동시 요청 N개는 각자 Notion을 조회한다(single-flight 없음).
  //   정상 폴링은 대부분 hit라 무해 — 콜드/만료 직후 동시 스파이크가 실측되면 in-flight promise 공유를 추가.
  const cached = getCachedFeed(token)
  if (cached !== undefined) return icsResponse(cached, token)

  try {
    const accessToken = getDecryptedTokenByUserId(calendar.userId)
    // 전체 페이지네이션(queryDatabase가 has_more 루프) — 100개 컷 아님(notion-api 스킬).
    // 필터(#13)는 Notion query API로 서버푸시 — 매칭 페이지만 페이지네이션(rate limit 절감).
    // ponytail: 필터 property가 Notion에서 삭제/타입변경되면 query API가 요청 전체를 거부→아래 catch 502로
    //   피드 정지(fail-closed, 데이터 유출 없음). degrade-skip은 실사용 요구 시 추가.
    const pages = await queryDatabase(
      accessToken,
      calendar.databaseId,
      buildNotionFilter(calendar.mapping.filters),
    )
    const ics = eventsToIcs(pagesToEvents(pages, calendar.mapping))

    setCachedFeed(token, ics) // 성공 .ics만 캐시 — 아래 catch(404/502)는 저장 안 함.
    return icsResponse(ics, token)
  } catch (error) {
    // Notion 실패(권한/네트워크/rate limit)·직렬화·mapping JSON 변조 → 상세 미노출 502
    // (databases 라우트 패턴). 본문에 토큰·Notion 상세 노출 금지.
    console.error('Feed generation failed:', error)
    return new Response('Failed to generate feed', { status: 502 })
  }
}
