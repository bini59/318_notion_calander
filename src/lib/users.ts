import { randomUUID } from 'node:crypto'
import { encrypt } from './crypto'
import { db } from './db'

// access_token은 반드시 encrypt() 거쳐 저장 (PLAN §7, 평문 저장 금지).
// workspace_id로 키잉해 같은 워크스페이스 재연결 시 새 레코드 대신 토큰만 갱신 → 중복 방지.
// ON CONFLICT는 기존 row의 id를 보존하므로 calendar FK가 유지된다(INSERT OR REPLACE는 id를 바꿔 FK를 끊는다).
export function upsertUserByWorkspace(input: {
  accessToken: string
  workspaceId: string
}): string {
  const encrypted = encrypt(input.accessToken)
  return db
    .prepare(
      `INSERT INTO user (id, notion_access_token, notion_workspace_id)
       VALUES (?, ?, ?)
       ON CONFLICT(notion_workspace_id)
       DO UPDATE SET notion_access_token = excluded.notion_access_token
       RETURNING id`,
    )
    .pluck()
    .get(randomUUID(), encrypted, input.workspaceId) as string
}
