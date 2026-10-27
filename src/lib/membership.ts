import type { NextRequest } from 'next/server'
import { getEnv } from './env'

export type Membership = {
  userId: string; clientId: string; state: 'active' | 'absent' | 'suspended' | 'withdrawn'
  version: number; cleanupId: string | null; cleanupPending: boolean
}
export class MembershipError extends Error {
  constructor(public status: number) { super('가입 상태를 확인하지 못했습니다. 상태를 새로 확인한 뒤 다시 시도해 주세요.') }
}
export async function membershipRequest(req: NextRequest, path = 'identity', body?: object): Promise<Membership> {
  const env = getEnv()
  let res: Response
  try { res = await fetch(`${env.AUTH_ORIGIN}/memberships/${path}?client_id=${encodeURIComponent(env.CLIENT_ID)}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: req.headers.get('cookie') ?? '', 'x-app-secret': env.APP_SECRET,
      ...(body ? { 'content-type': 'application/json', 'x-csrf-token': req.headers.get('x-csrf-token') ?? '', origin: req.headers.get('origin') ?? '' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', signal: AbortSignal.timeout(5_000),
  })
  } catch { console.error('[membership] upstream request failed', { stage: path, kind: 'network' }); throw new MembershipError(503) }
  if (!res.ok) { console.error('[membership] upstream request failed', { stage: path, kind: 'http', status: res.status }); throw new MembershipError([400, 401, 403, 409, 429].includes(res.status) ? res.status : 502) }
  let value: Membership & { purpose?: string }
  try { value = await res.json() } catch { console.error('[membership] invalid response', { stage: path, kind: 'json' }); throw new MembershipError(502) }
  if (!value || typeof value.userId !== 'string' || !value.userId || value.clientId !== env.CLIENT_ID || !Number.isSafeInteger(value.version) ||
      !['active', 'absent', 'suspended', 'withdrawn'].includes(value.state) ||
      (value.cleanupId !== null && typeof value.cleanupId !== 'string') || typeof value.cleanupPending !== 'boolean' ||
      (!body && value.purpose !== 'membership-lifecycle')) { console.error('[membership] invalid response', { stage: path, kind: 'schema' }); throw new MembershipError(502) }
  return value
}
export function validMembershipCsrf(req: NextRequest): boolean {
  const csrf = req.cookies.get('csrf')?.value
  return req.headers.get('origin') === new URL(getEnv().BASE_URL).origin &&
    !!csrf && csrf === req.headers.get('x-csrf-token')
}
