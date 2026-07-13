import { randomUUID } from 'node:crypto'
import { generateFeedToken } from './crypto'
import { db } from './db'
import { getEnv } from './env'
import type { CalendarMapping } from './mapping'

// 선택된 Notion DB를 구독 캘린더로 등록. Notion이 원본이므로 이벤트는 저장하지 않고
// (PLAN §4) DB 참조 + 필드 매핑(#5) + 추측불가 feed_token만 남긴다.
// mapping은 라우트가 검증(validateMappingAgainstProperties)한 뒤 넘어온 값 — 여기선 직렬화만.
// /feed/{token}.ics 라우트는 #6. 여기선 URL 문자열만 발급한다.
export function createCalendar(input: {
  userId: string
  databaseId: string
  mapping: CalendarMapping
}): { feedToken: string; feedUrl: string } {
  const feedToken = generateFeedToken()

  db.prepare(
    `INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), input.userId, input.databaseId, feedToken, JSON.stringify(input.mapping))

  return {
    feedToken,
    feedUrl: `${getEnv().BASE_URL}/feed/${feedToken}.ics`,
  }
}

// feed_token으로 캘린더를 조회 (이슈 #7). 피드는 무인증 — 토큰이 곧 접근권(PLAN §7).
// 무효/폐기 토큰은 정상 흐름이므로 throw 아닌 undefined 반환 → 라우트가 404로 변환.
export function getCalendarByFeedToken(
  token: string,
): { userId: string; databaseId: string; mapping: CalendarMapping } | undefined {
  const row = db
    .prepare(
      'SELECT user_id AS userId, notion_database_id AS databaseId, mapping FROM calendar WHERE feed_token = ?',
    )
    .get(token) as { userId: string; databaseId: string; mapping: string } | undefined
  if (!row) return undefined

  // ponytail: mapping은 쓰기 시 validateMappingAgainstProperties로 검증된 자체 데이터 — 재검증 생략.
  // JSON.parse 실패(수기 DB 변조)는 throw → 라우트가 502로 흡수.
  return {
    userId: row.userId,
    databaseId: row.databaseId,
    mapping: JSON.parse(row.mapping) as CalendarMapping,
  }
}
