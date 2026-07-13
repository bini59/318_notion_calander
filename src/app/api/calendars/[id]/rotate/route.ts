import { NextResponse, type NextRequest } from 'next/server'
import { rotateFeedToken } from '@/lib/calendars'
import { requireToken } from '@/lib/require-token'

export const dynamic = 'force-dynamic'

// feed_token 재발급 → 기존 구독 URL 즉시 무효화 (이슈 #8, PLAN §7).
// IDOR: rotateFeedToken이 WHERE id=? AND user_id=?로 소유권을 강제 → 미소유/없음은
// 구분 없이 undefined → 404로 존재 은닉. 세션 없음은 requireToken이 401.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const result = rotateFeedToken(id, auth.userId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ feedUrl: result.feedUrl }, { status: 200 })
}
