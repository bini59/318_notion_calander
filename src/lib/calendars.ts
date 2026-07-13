import { randomUUID } from 'node:crypto'
import { generateFeedToken } from './crypto'
import { db } from './db'
import { getEnv } from './env'

// 선택된 Notion DB를 구독 캘린더로 등록. Notion이 원본이므로 이벤트는 저장하지 않고
// (PLAN §4) DB 참조 + 추측불가 feed_token만 남긴다.
// ponytail: mapping은 '{}'(빈 자동감지)로 저장 — 상세 필드 매핑 override는 #5.
// /feed/{token}.ics 라우트도 #5. 여기선 URL 문자열만 발급한다.
export function createCalendar(input: {
  userId: string
  databaseId: string
}): { feedToken: string; feedUrl: string } {
  const feedToken = generateFeedToken()

  db.prepare(
    `INSERT INTO calendar (id, user_id, notion_database_id, feed_token, mapping)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), input.userId, input.databaseId, feedToken, '{}')

  return {
    feedToken,
    feedUrl: `${getEnv().BASE_URL}/feed/${feedToken}.ics`,
  }
}
