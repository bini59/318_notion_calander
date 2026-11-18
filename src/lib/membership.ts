import type { NextRequest } from 'next/server'
import { getEnv } from './env'

export type Membership = {
  userId: string; clientId: string; state: 'active' | 'absent' | 'suspended' | 'withdrawn'
  version: number; cleanupId: string | null; cleanupPending: boolean
}
export class MembershipError extends Error {
  constructor(public status: number) { super(`Membership request failed (${status})`) }
}
export async function membershipRequest(req: NextRequest, path = 'identity', body?: object): Promise<Membership> {
  const env = getEnv()
  const res = await fetch(`${env.AUTH_ORIGIN}/memberships/${path}?client_id=${encodeURIComponent(env.CLIENT_ID)}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie: req.headers.get('cookie') ?? '', 'x-app-secret': env.APP_SECRET,
      ...(body ? { 'content-type': 'application/json', 'x-csrf-token': req.headers.get('x-csrf-token') ?? '', origin: req.headers.get('origin') ?? '' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store', signal: AbortSignal.timeout(5_000),
  })
  if (!res.ok) throw new MembershipError([400, 401, 403, 409, 429].includes(res.status) ? res.status : 502)
  const value = await res.json() as Membership & { purpose?: string }
  if (!value.userId || value.clientId !== env.CLIENT_ID || !Number.isSafeInteger(value.version) ||
      !['active', 'absent', 'suspended', 'withdrawn'].includes(value.state) ||
      (!body && value.purpose !== 'membership-lifecycle')) throw new MembershipError(502)
  return value
}
export function validMembershipCsrf(req: NextRequest): boolean {
  const csrf = req.cookies.get('csrf')?.value
  return req.headers.get('origin') === new URL(getEnv().BASE_URL).origin &&
    !!csrf && csrf === req.headers.get('x-csrf-token')
}
