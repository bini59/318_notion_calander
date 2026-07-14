import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronDown,
  Database,
  ExternalLink,
  Code2,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

const connectHref = '/api/auth/notion'

const steps = [
  {
    icon: Link2,
    number: '01',
    title: 'Notion을 연결해요',
    description: 'OAuth로 안전하게 연결합니다. 비밀번호를 공유할 필요가 없어요.',
  },
  {
    icon: Database,
    number: '02',
    title: '데이터베이스를 골라요',
    description: '일정 제목과 날짜로 쓸 Notion 속성을 간단히 지정하세요.',
  },
  {
    icon: CalendarCheck,
    number: '03',
    title: '캘린더에 추가해요',
    description: '만들어진 구독 링크를 복사해 평소 쓰는 캘린더에 추가하면 끝이에요.',
  },
]

const useCases = [
  ['콘텐츠 캘린더', '발행일과 캠페인 일정을 개인 캘린더에서도 한눈에 확인해요.'],
  ['프로젝트 마감', 'Notion에서 관리하는 마감일을 놓치지 않고 챙겨요.'],
  ['팀 일정', '회의와 주요 일정을 각자 쓰는 캘린더 앱에서 함께 봐요.'],
]

const faqs = [
  {
    question: 'iCal이 무엇인가요?',
    answer:
      'Apple 캘린더, Google 캘린더, Outlook 등 대부분의 캘린더 앱이 지원하는 표준 구독 형식이에요. 별도 앱을 설치할 필요가 없습니다.',
  },
  {
    question: '내 Notion 데이터는 안전한가요?',
    answer:
      '연결할 때 허용한 데이터베이스만 읽으며 Notion의 내용을 별도로 저장하지 않습니다. 만든 구독 링크는 일정 내용을 보여줄 수 있으니 공개적으로 공유하지 마세요.',
  },
  {
    question: 'Notion에서 수정하면 바로 반영되나요?',
    answer:
      '캘린더 앱이 구독 정보를 새로 확인할 때 Notion의 최신 내용을 가져옵니다. 갱신 주기는 사용하는 캘린더 앱의 정책에 따라 달라질 수 있어요.',
  },
  {
    question: '데이터베이스가 목록에 보이지 않아요.',
    answer:
      'Notion 연결 화면에서 해당 데이터베이스를 이 서비스에 공유했는지 확인해 주세요. 연결 후에도 보이지 않으면 설정 화면에서 다시 불러올 수 있습니다.',
  },
]

function Brand() {
  return (
    <a href="#top" className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        N
      </span>
      <span>Notion Calendar Bridge</span>
    </a>
  )
}

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[560px]" aria-label="Notion 데이터베이스를 캘린더로 만드는 화면 미리보기">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/8 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10">
        <div className="flex items-center gap-1.5 border-b px-4 py-3" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="ml-3 text-xs text-muted-foreground">내 캘린더</span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">콘텐츠 캘린더</p>
              <p className="mt-1 text-xs text-muted-foreground">Notion 데이터베이스와 연결됨</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" /> 활성
            </span>
          </div>
          <div className="mt-5 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">다가오는 일정</p>
                <p className="truncate text-sm font-medium">공개 베타 출시</p>
              </div>
              <p className="text-xs font-medium">7월 21일</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background p-2 pl-3">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">https://calendar.example/feed/••••••</p>
            <span className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
              <Check className="size-3.5" aria-hidden="true" /> 복사
            </span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs text-muted-foreground">
            {['Google', 'Apple', 'Outlook'].map((calendar) => (
              <div key={calendar} className="rounded-lg border px-2 py-2.5">{calendar}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<{ notion?: string }>
}) {
  const denied = (await searchParams)?.notion === 'denied'

  return (
    <main id="top" className="min-h-svh overflow-hidden">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <Button asChild className="hidden sm:inline-flex">
            <a href={connectHref}>Notion 연결</a>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_0.9fr] lg:py-28">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" /> 공개 베타
          </div>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.6rem] lg:leading-[1.08]">
            Notion 일정을 캘린더 앱에서 바로 구독하세요
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            매번 복사·붙여넣기 없이, Notion 데이터베이스의 일정을 Google·Apple·Outlook 캘린더에서 자동으로 확인하세요.
          </p>
          {denied && (
            <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Notion 연결이 취소되었어요. 준비되면 다시 시도해 주세요.
            </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-5">
              <a href={connectHref}>Notion 연결하고 시작하기 <ArrowRight aria-hidden="true" /></a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5">
              <a href="#how-it-works">작동 방식 보기</a>
            </Button>
          </div>
          <div className="mt-6 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>읽기 전용 · 일정 별도 저장 없음 · 언제든 연결 해제</p>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
            <span className="text-xs font-normal uppercase tracking-wider">Works with</span>
            <span>Google Calendar</span><span>Apple Calendar</span><span>Outlook</span>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section id="how-it-works" className="border-y bg-muted/30 scroll-mt-8">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <p className="text-sm font-semibold text-primary">간단한 연결</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">세 단계면 충분해요</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {steps.map(({ icon: Icon, number, title, description }) => (
              <article key={number} className="rounded-2xl border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="font-mono text-xs text-muted-foreground">{number}</span>
                </div>
                <h3 className="mt-6 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div>
            <p className="text-sm font-semibold text-primary">일하는 방식은 그대로</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">Notion이 원본이고, 캘린더는 보기 편한 창이 됩니다</h2>
            <p className="mt-4 leading-7 text-muted-foreground">일정은 계속 Notion에서 관리하세요. 익숙한 캘린더 앱에서는 필요한 순간에 최신 일정을 확인할 수 있어요.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {useCases.map(([title, description]) => (
              <article key={title} className="rounded-2xl bg-muted/50 p-5">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
        <div className="mt-14 grid overflow-hidden rounded-2xl border md:grid-cols-3">
          {[
            [ShieldCheck, '읽기 전용 접근', '허용한 Notion 데이터베이스만 읽어요.'],
            [RefreshCw, 'Notion에서 바로 확인', '캘린더가 요청할 때 최신 일정을 가져와요.'],
            [Code2, '오픈소스', '코드를 직접 확인하고 원하는 곳에 운영할 수 있어요.'],
          ].map(([Icon, title, description], index) => {
            const TrustIcon = Icon as typeof ShieldCheck
            return (
              <div key={String(title)} className={`p-6 ${index > 0 ? 'border-t md:border-t-0 md:border-l' : ''}`}>
                <TrustIcon className="size-5 text-primary" aria-hidden="true" />
                <h3 className="mt-4 font-semibold">{String(title)}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{String(description)}</p>
              </div>
            )
          })}
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="text-sm font-semibold text-primary">자주 묻는 질문</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">시작하기 전에 궁금한 점</h2>
          </div>
          <div className="divide-y rounded-2xl border bg-card px-5 sm:px-6">
            {faqs.map(({ question, answer }) => (
              <details key={question} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  {question}
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="max-w-2xl pt-3 text-sm leading-6 text-muted-foreground">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-20 text-center sm:px-8 sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight">오늘부터 Notion 일정을 놓치지 마세요</h2>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground">Notion을 연결하고, 늘 쓰던 캘린더에서 일정을 확인하는 데 몇 분이면 충분합니다.</p>
        <Button asChild size="lg" className="mt-8 h-11 px-5">
          <a href={connectHref}>무료로 시작하기 <ArrowRight aria-hidden="true" /></a>
        </Button>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Brand />
          <div className="flex items-center gap-5">
            <a className="inline-flex items-center gap-1.5 hover:text-foreground" href="https://github.com/bini59/318_notion_calander" target="_blank" rel="noreferrer">
              <Code2 className="size-4" aria-hidden="true" /> GitHub <ExternalLink className="size-3" aria-hidden="true" />
            </a>
            <span>MIT License</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
