import { randomUUID } from 'node:crypto'
import { decrypt, encrypt } from './crypto'
import { db } from './db'

// access_token은 반드시 encrypt() 거쳐 저장 (PLAN §7, 평문 저장 금지).
// 사용자 = 321_auth userId(auth_user_id). 같은 사람이 재연결하면 토큰만 갱신해 row id(calendar FK)를 유지한다.
// SSO 도입 전 row(auth_user_id NULL)는 같은 워크스페이스로 Notion OAuth를 통과한 첫 로그인 사용자가 이어받는다.
// ponytail: auth 사용자당 워크스페이스 1개 — 다른 워크스페이스로 재연결하면 교체된다.
export const upsertUser = db.transaction(
  (input: { authUserId: string; accessToken: string; workspaceId: string }): string => {
    const encrypted = encrypt(input.accessToken)
    const mine = db.prepare('SELECT id FROM user WHERE auth_user_id = ?').pluck().get(input.authUserId) as
      | string
      | undefined
    const id =
      mine ??
      (db
        .prepare('SELECT id FROM user WHERE notion_workspace_id = ? AND auth_user_id IS NULL')
        .pluck()
        .get(input.workspaceId) as string | undefined)
    if (id) {
      db.prepare(
        'UPDATE user SET auth_user_id = ?, notion_access_token = ?, notion_workspace_id = ? WHERE id = ?',
      ).run(input.authUserId, encrypted, input.workspaceId, id)
      return id
    }
    const created = randomUUID()
    db.prepare(
      'INSERT INTO user (id, auth_user_id, notion_access_token, notion_workspace_id) VALUES (?, ?, ?, ?)',
    ).run(created, input.authUserId, encrypted, input.workspaceId)
    return created
  },
)

// 내부 user id(calendar.user_id — 피드 라우트가 사용)로 복호화된 access_token을 돌려준다. 없으면 throw.
export function getDecryptedTokenByUserId(userId: string): string {
  const token = db.prepare('SELECT notion_access_token FROM user WHERE id = ?').pluck().get(userId) as
    | string
    | undefined
  if (!token) throw new Error('User not found')
  return decrypt(token)
}

// auth userId로 내부 user id와 복호화된 Notion access_token을 돌려준다.
// Notion 미연결(행 없음)은 호출부에서 401로 변환하도록 throw.
export function getUserByAuthId(authUserId: string): { id: string; accessToken: string } {
  const row = db
    .prepare('SELECT id, notion_access_token AS token FROM user WHERE auth_user_id = ?')
    .get(authUserId) as { id: string; token: string } | undefined
  if (!row) throw new Error('User not found')
  return { id: row.id, accessToken: decrypt(row.token) }
}
