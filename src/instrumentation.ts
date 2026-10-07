// 서버 기동 시점에 env 검증 — 누락이면 첫 요청이 아니라 부팅에서 죽는다
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('./lib/env')
    getEnv()
    await import('./lib/db') // 연결 오픈 = 스키마(DDL) 적용 — DB 경로 문제도 부팅에서 죽는다

    // 321_auth 탈퇴 반영 — 부팅 직후 한 번, 이후 10분마다. auth 장애는 로그만 남기고 다음 주기에 재시도.
    const { syncDeletions } = await import('./lib/auth')
    const { deleteUserByAuthId } = await import('./lib/users')
    const sync = () =>
      syncDeletions(deleteUserByAuthId).catch((error) => console.error('deletion sync failed:', error))
    void sync()
    setInterval(sync, 10 * 60_000).unref()
  }
}
