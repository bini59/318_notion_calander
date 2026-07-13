import { Button } from '@/components/ui/button'

// 랜딩: Notion 연결 진입점. 연결 시작은 서버 라우트 /api/auth/notion가 담당.
// Next 16: searchParams는 Promise → await 필수.
export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ notion?: string }>
}) {
  const denied = (await searchParams)?.notion === 'denied'
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[640px] flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Notion → iCal 브릿지</h1>
      <p className="mt-4 text-base text-muted-foreground">
        Notion 데이터베이스를 표준 iCal(.ics) 구독 피드로 노출합니다. 읽기 전용, Notion이 원본입니다.
      </p>
      {denied && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          연결이 취소되었습니다. 다시 시도하세요.
        </p>
      )}
      <div className="mt-8">
        <Button asChild size="lg">
          <a href="/api/auth/notion">Notion 연결</a>
        </Button>
      </div>
    </main>
  )
}
