import { getEnv } from './env'

// 321_auth(SSO) 연동. 로그인은 auth.bini59.dev가 발급한 공유 sid 쿠키가 전부이고,
// 이 앱은 앱 서버에서 /verify로 결과만 소비한다(쿠키는 직접 헤더로 넘겨야 함).
export const SID_COOKIE = 'sid'

export type AuthUser = {
  userId: string
  email: string | null
  name: string | null
  avatarUrl: string | null
  membership: { role: string; status: string; joinedAt: string } | null
}

// 200=허용, 401=로그인 필요, 403=이 서비스 membership 없음/정지. auth 장애는 throw(호출부가 503).
export type Verdict = { status: 200 | 401 | 403; user: AuthUser | null }

// ponytail: 프로세스 메모리 캐시 — 로그아웃/정지 반영이 TTL만큼 늦고 인스턴스가 여럿이면 각자 가진다.
const TTL_MS = 10_000
const cache = new Map<string, { exp: number; verdict: Verdict }>()

export function forgetSid(sid: string): void {
  cache.delete(sid)
}

export async function verifySid(sid: string): Promise<Verdict> {
  const hit = cache.get(sid)
  if (hit && hit.exp > Date.now()) return hit.verdict

  const env = getEnv()
  const res = await fetch(
    `${env.AUTH_ORIGIN}/verify?client_id=${encodeURIComponent(env.CLIENT_ID)}`,
    {
      headers: { cookie: `${SID_COOKIE}=${sid}`, 'x-app-secret': env.APP_SECRET },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    },
  )
  let verdict: Verdict
  if (res.status === 401 || res.status === 403) {
    verdict = { status: res.status, user: null }
  } else if (res.ok) {
    const user = (await res.json()) as AuthUser
    // membership null(가입 전)과 정지 모두 접근 불가 — auto_provision이면 /verify가 알아서 만들어 준다.
    verdict = { status: user.membership?.status === 'active' ? 200 : 403, user }
  } else {
    throw new Error(`auth verify failed: ${res.status}`)
  }

  if (cache.size > 1000) cache.clear()
  cache.set(sid, { exp: Date.now() + TTL_MS, verdict })
  return verdict
}

// 321_auth 탈퇴 큐 소비: 이 앱이 아직 확인하지 않은 탈퇴자의 데이터를 지우고 ack 한다.
// 지우기나 ack 가 실패하면 throw — ack 안 된 건은 다음 주기에 다시 내려온다.
export async function syncDeletions(remove: (authUserId: string) => void): Promise<number> {
  const env = getEnv()
  const query = `client_id=${encodeURIComponent(env.CLIENT_ID)}`
  const headers = { 'x-app-secret': env.APP_SECRET }
  const res = await fetch(`${env.AUTH_ORIGIN}/deletions?${query}`, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`auth deletions failed: ${res.status}`)
  const { deletions } = (await res.json()) as { deletions: { userId: string }[] }
  for (const { userId } of deletions) {
    remove(userId)
    const ack = await fetch(`${env.AUTH_ORIGIN}/deletions/${encodeURIComponent(userId)}/ack?${query}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(10_000),
    })
    if (!ack.ok) throw new Error(`auth deletion ack failed: ${ack.status}`)
  }
  return deletions.length
}
