import type { NextRequest } from 'next/server'

// 로그인은 321_auth의 공유 sid 쿠키가 담당한다. proxy.ts가 sid를 auth /verify로 검증한 뒤
// 통과시킬 때 auth userId를 이 헤더에 덮어써 넣는다. proxy matcher가 /api/*, /setup 전체를
// 덮으므로 클라이언트가 보낸 값은 항상 덮어써진다(위조 불가).
export const USER_HEADER = 'x-user-id'

export function readSession(req: NextRequest): string | null {
  return req.headers.get(USER_HEADER)
}
