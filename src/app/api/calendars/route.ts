import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createCalendar } from '@/lib/calendars'
import { hasDateProperty } from '@/lib/notion'
import { readSession } from '@/lib/session'
import { getDecryptedTokenByUserId } from '@/lib/users'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ databaseId: z.string().min(1) })

export async function POST(req: NextRequest) {
  const userId = readSession(req)
  if (!userId) return NextResponse.json({ error: 'Not connected' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'databaseId가 필요합니다' }, { status: 400 })
  }
  const { databaseId } = parsed.data

  let accessToken: string
  try {
    accessToken = getDecryptedTokenByUserId(userId)
  } catch {
    return NextResponse.json({ error: 'Not connected' }, { status: 401 })
  }

  try {
    // PLAN §5 필수 가드: date 속성이 하나도 없으면 무의미한 캘린더 생성 차단.
    if (!(await hasDateProperty(accessToken, databaseId))) {
      return NextResponse.json({ error: 'date 속성이 있는 DB만 캘린더로 만들 수 있습니다' }, { status: 400 })
    }
    const { feedUrl } = createCalendar({ userId, databaseId })
    return NextResponse.json({ feedUrl }, { status: 201 })
  } catch (error) {
    console.error('Calendar creation failed:', error)
    return NextResponse.json({ error: 'Failed to create calendar' }, { status: 502 })
  }
}
