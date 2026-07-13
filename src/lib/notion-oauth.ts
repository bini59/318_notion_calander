import { z } from 'zod'
import { getEnv } from './env'

// Notion public OAuth. 계약: notion-api 스킬 + PLAN §3/§7.
// redirect_uri는 start·token 교환 양쪽에서 반드시 동일 — 불일치가 OAuth 대표 실패원인이라 상수 1개로 고정.
const NOTION_VERSION = '2022-06-28'
const AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize'
const TOKEN_URL = 'https://api.notion.com/v1/oauth/token'

export const STATE_COOKIE = 'notion_oauth_state'

export const REDIRECT_URI = `${getEnv().BASE_URL}/api/auth/notion/callback`

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getEnv().NOTION_CLIENT_ID,
    response_type: 'code',
    owner: 'user',
    redirect_uri: REDIRECT_URI,
    state,
  })
  return `${AUTHORIZE_URL}?${params}`
}

// Notion은 스키마를 확장할 수 있으므로 필요한 필드만 검증하고 나머지는 무시한다.
const tokenResponse = z.object({
  access_token: z.string().min(1),
  workspace_id: z.string().min(1),
})

export async function exchangeCodeForToken(
  code: string,
): Promise<{ accessToken: string; workspaceId: string }> {
  const env = getEnv()
  const basic = Buffer.from(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`).toString(
    'base64',
  )
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION,
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  // 응답 본문에 토큰/에러 상세가 있을 수 있어 status만 표면화 (민감정보 미노출).
  if (!res.ok) throw new Error(`Notion token exchange failed: ${res.status}`)
  const { access_token, workspace_id } = tokenResponse.parse(await res.json())
  return { accessToken: access_token, workspaceId: workspace_id }
}
