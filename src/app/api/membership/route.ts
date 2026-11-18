import { requestMessages } from '@/lib/i18n-server'
import { NextResponse, type NextRequest } from 'next/server'
import { forgetSid } from '@/lib/auth'
import { getEnv } from '@/lib/env'
import { membershipRequest, MembershipError, validMembershipCsrf } from '@/lib/membership'
import { blockMembership, claimMembership, fenceMembership, releaseMembership, unblockMembership, pendingRejoin, prepareRejoin } from '@/lib/membership-store'
import { deleteUserByAuthId } from '@/lib/users'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
function failure(req: NextRequest, error: unknown) {
  const messages = requestMessages(req.headers)
  return NextResponse.json({ error: error instanceof MembershipError ? messages.membershipStatusError : messages.membershipError },
    { status: error instanceof MembershipError ? error.status : 503 })
}
export async function GET(req: NextRequest) {
  try {
    const state = await membershipRequest(req)
    // Auth issues the browser's double-submit token; never synthesize it on the service server.
    const env = getEnv()
    const me = await fetch(`${env.AUTH_ORIGIN}/me`, { headers: { cookie: req.headers.get('cookie') ?? '' }, cache: 'no-store', signal: AbortSignal.timeout(5_000) })
    if (!me.ok) throw new MembershipError(me.status === 401 ? 401 : 502)
    const res = NextResponse.json({ ...state, rejoinRecovery: state.state === 'active' && pendingRejoin(state.userId) === state.version, accountUrl: `${env.AUTH_ORIGIN}/client` })
    for (const cookie of me.headers.getSetCookie()) res.headers.append('set-cookie', cookie)
    res.headers.set('cache-control', 'no-store')
    return res
  } catch (error) { return failure(req, error) }
}
export async function POST(req: NextRequest) {
  if (!validMembershipCsrf(req)) return NextResponse.json({ error: requestMessages(req.headers).membershipRequestUnverified }, { status: 403 })
  const body = await req.json().catch(() => null)
  if (!body || !['withdraw', 'cleanup', 'rejoin'].includes(body.action) || !Number.isSafeInteger(body.version) || body.version < 0 ||
      Object.keys(body).some(k => !['action', 'version', 'consent'].includes(k)) || body.consent !== true) {
    return NextResponse.json({ error: requestMessages(req.headers).membershipConsentRequired }, { status: 400 })
  }
  let userId: string | undefined
  let owner: string | null = null
  try {
    const initial = await membershipRequest(req)
    userId = initial.userId
    owner = claimMembership(userId)
    if (!owner) throw new MembershipError(409)
    const state = await membershipRequest(req)
    if (state.version !== body.version) throw new MembershipError(409)
    if (body.action === 'rejoin') {
      if (state.state === 'active' && pendingRejoin(userId) === state.version) {
        unblockMembership(userId, owner, state.version)
        const sid = req.cookies.get('sid')?.value
        if (sid) forgetSid(sid)
        return NextResponse.json({ ok: true })
      }
      if (state.state !== 'withdrawn' || state.cleanupPending) throw new MembershipError(409)
      fenceMembership(userId, owner)
      prepareRejoin(userId, owner, state.version)
      const joined = await membershipRequest(req, 'rejoin', { version: state.version, consent: true })
      if (joined.state !== 'active' || joined.version !== state.version + 1 || joined.userId !== userId) throw new MembershipError(502)
      unblockMembership(userId, owner, joined.version)
    } else {
      if (body.action === 'cleanup' && state.state !== 'withdrawn') throw new MembershipError(409)
      // Persist the write/feed barrier before contacting auth, including uncertain network outcomes.
      blockMembership(userId, owner, state.version, state.cleanupId)
      const withdrawn = state.state === 'withdrawn' ? state : await membershipRequest(req, 'withdraw', { version: state.version })
      if (withdrawn.state !== 'withdrawn' || !withdrawn.cleanupId) throw new MembershipError(502)
      blockMembership(userId, owner, withdrawn.version, withdrawn.cleanupId)
      if (withdrawn.cleanupPending) {
        const current = await membershipRequest(req)
        if (current.state !== 'withdrawn' || current.version !== withdrawn.version || current.cleanupId !== withdrawn.cleanupId) throw new MembershipError(409)
        db.transaction(() => {
          fenceMembership(userId!, owner!)
          deleteUserByAuthId(userId!)
        })()
        fenceMembership(userId, owner)
        const ack = await membershipRequest(req, 'cleanup/ack', { version: withdrawn.version, cleanupId: withdrawn.cleanupId })
        if (ack.state !== 'withdrawn' || ack.version !== withdrawn.version || ack.cleanupId !== withdrawn.cleanupId || ack.cleanupPending) throw new MembershipError(502)
      }
    }
    const sid = req.cookies.get('sid')?.value
    if (sid) forgetSid(sid)
    return NextResponse.json({ ok: true })
  } catch (error) { return failure(req, error) }
  finally { if (userId && owner) releaseMembership(userId, owner) }
}
