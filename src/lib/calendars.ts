import { randomUUID } from 'node:crypto'
import { generateFeedToken } from './crypto'
import { db } from './db'
import { getEnv } from './env'
import { invalidateFeed } from './feed-cache'
import type { CalendarMapping } from './mapping'

// 선택된 Notion DB를 구독 캘린더로 등록. Notion이 원본이므로 이벤트는 저장하지 않고
// (PLAN §4) DB 참조 + 필드 매핑(#5) + 추측불가 feed_token만 남긴다.
// mapping은 라우트가 검증(validateMappingAgainstProperties)한 뒤 넘어온 값 — 여기선 직렬화만.
// /feed/{token}.ics 라우트는 #6. 여기선 URL 문자열만 발급한다.
export function createCalendar(input: {
  userId: string
  databaseId: string
  mapping: CalendarMapping
}): { id: string; feedToken: string; feedUrl: string } {
  const id = randomUUID()
  const feedToken = generateFeedToken()

  db.prepare(
    `INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.userId, input.databaseId, feedToken, JSON.stringify(input.mapping))

  return {
    id,
    feedToken,
    feedUrl: feedUrl(feedToken),
  }
}

// 소유자가 feed_token을 재발급해 기존 URL을 즉시 무효화 (이슈 #8, PLAN §7).
// IDOR 방어: WHERE에 user_id를 포함해 DB 레벨에서 소유권을 강제한다. 미소유/없음은
// changes===0으로 구분 없이 undefined 반환 → 라우트가 404로 존재를 은닉(getCalendarById 불필요).
// 즉시 무효화: getCalendarByFeedToken이 WHERE feed_token=?로 새 토큰만 찾으므로 옛 URL은 자동 404.
export function rotateFeedToken(
  calendarId: string,
  userId: string,
): { feedUrl: string } | undefined {
  // ponytail: 256bit(randomBytes(32)) 토큰이라 UNIQUE 충돌 확률 무시 가능 — 재시도 루프 생략.
  //           실제 충돌이 관측되면(사실상 불가) 여기에 재시도 상한을 건다.
  const token = generateFeedToken()

  // 옛 토큰을 UPDATE 전에 확보 — 피드 캐시(#11)를 무효화하려면 그 값이 필요하다.
  // UPDATE는 id+user_id 기준이라 옛 feed_token을 반환하지 않으므로 소유권 조건 동일하게 SELECT.
  const old = db
    .prepare('SELECT feed_token AS feedToken FROM calendar WHERE id = ? AND user_id = ?')
    .get(calendarId, userId) as { feedToken: string } | undefined

  const { changes } = db
    .prepare('UPDATE calendar SET feed_token = ? WHERE id = ? AND user_id = ?')
    .run(token, calendarId, userId)
  if (changes === 0) return undefined

  // 폐기된 옛 토큰의 캐시를 즉시 제거 — 안 하면 폐기된 URL이 최대 5분간 stale .ics 서빙(#8 회귀).
  if (old) invalidateFeed(old.feedToken)

  return { feedUrl: feedUrl(token) }
}

const feedUrl = (token: string) => `${getEnv().BASE_URL}/feed/${token}.ics`

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
