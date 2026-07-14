import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { deleteCalendar, renameCalendar } from '@/lib/calendars'
import { requireToken } from '@/lib/require-token'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({ name: z.string().trim().min(1).max(200) })

// 캘린더 이름 변경 (이슈 #18). DELETE 형제 라우트와 동일 IDOR/캐시무효화 패턴.
// renameCalendar가 WHERE id=? AND user_id=?로 소유권 강제 → 미소유/없음은 undefined → 404 존재 은닉.
// 성공 시 lib가 invalidateFeed로 stale .ics(옛 X-WR-CALNAME) 캐시 제거. 세션 없음은 requireToken이 401.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '이름(name)이 필요합니다' }, { status: 400 })
  }

  const { id } = await params
  const result = renameCalendar(id, auth.userId, parsed.data.name)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(result)
}

// 캘린더 삭제 (이슈 #12). rotate 형제 라우트와 동일 패턴.
// IDOR: deleteCalendar가 WHERE id=? AND user_id=?로 소유권 강제 → 미소유/없음은 false → 404 존재 은닉.
// 삭제 성공 시 lib가 invalidateFeed로 stale 피드 캐시 제거. 세션 없음은 requireToken이 401.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireToken(req)
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!deleteCalendar(id, auth.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return new NextResponse(null, { status: 204 })
}
