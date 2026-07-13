import { NextResponse, type NextRequest } from 'next/server'
import { deleteCalendar } from '@/lib/calendars'
import { requireToken } from '@/lib/require-token'

export const dynamic = 'force-dynamic'

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
