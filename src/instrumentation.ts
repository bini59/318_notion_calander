// 서버 기동 시점에 env 검증 — 누락이면 첫 요청이 아니라 부팅에서 죽는다
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('./lib/env')
    getEnv()
    await import('./lib/db') // 연결 오픈 = 스키마(DDL) 적용 — DB 경로 문제도 부팅에서 죽는다
  }
}
