'use client'

import { use } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronDown,
  Database,
  Code2,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

import { useLocale, useTranslations } from '@/lib/i18n-client'
import { Footer } from '@/components/Footer'
import { Button } from '@/components/ui/button'

// 로그인 여부는 proxy.ts가 판단한다: 미로그인이면 auth.bini59.dev 로그인으로, 로그인이면 바로 설정 화면.
const connectHref = '/setup'


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
  const t = useTranslations()
  const locale = useLocale()
  return (
    <div className="relative mx-auto w-full max-w-[560px]" aria-label={t('previewOfANotionDatabaseConverted')}>
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-primary/8 blur-3xl" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10">
        <div className="flex items-center gap-1.5 border-b px-4 py-3" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="ml-3 text-xs text-muted-foreground">{t('myCalendars')}</span>
        </div>
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">{t('contentCalendar')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t('connectedToANotionDatabase')}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-500" /> {t('active')} </span>
          </div>
          <div className="mt-5 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <CalendarCheck className="size-5 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t('upcomingEvent')}</p>
                <p className="truncate text-sm font-medium">{t('publicBetaLaunch')}</p>
              </div>
              <p className="text-xs font-medium">{new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date('2026-07-21T12:00:00Z'))}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-lg border bg-background p-2 pl-3">
            <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">https://calendar.example/feed/••••••</p>
            <span className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">
              <Check className="size-3.5" aria-hidden="true" /> {t('copy')} </span>
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

export default function Home({
  searchParams,
}: {
  searchParams?: Promise<{ notion?: string }>
}) {
  const t = useTranslations()
const steps = [
  {
    icon: Link2,
    number: '01',
    title: t('connectNotion'),
    description: t('connectSecurelyWithOauthYouNever'),
  },
  {
    icon: Database,
    number: '02',
    title: t('chooseADatabase'),
    description: t('chooseTheNotionPropertiesToUse'),
  },
  {
    icon: CalendarCheck,
    number: '03',
    title: t('addItToYourCalendar'),
    description: t('copyYourSubscriptionLinkAndAdd'),
  },
]

const useCases = [
  [t('contentCalendar'), t('seePublishingDatesAndCampaignSchedules')],
  [t('projectDeadlines'), t('keepTrackOfDeadlinesManagedIn')],
  [t('teamSchedule'), t('seeMeetingsAndKeyDatesIn')],
]

const faqs = [
  {
    question: t('whatIsIcal'),
    answer:
      t('icalIsAStandardSubscriptionFormat'),
  },
  {
    question: t('isMyNotionDataSafe'),
    answer:
      t('weOnlyReadTheDatabasesYou'),
  },
  {
    question: t('doNotionEditsAppearImmediately'),
    answer:
      t('yourCalendarAppFetchesTheLatest'),
  },
  {
    question: t('iCannotSeeMyDatabase'),
    answer:
      t('makeSureYouSharedTheDatabase'),
  },
]

  const denied = searchParams ? use(searchParams).notion === 'denied' : false

  return (
    <main id="top" className="min-h-svh overflow-hidden">
      <header className="border-b bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <Button asChild className="hidden sm:inline-flex">
            <a href={connectHref}>{t('connectNotion28')}</a>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1fr_0.9fr] lg:py-28">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" /> {t('publicBeta')} </div>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.6rem] lg:leading-[1.08]">{t('subscribeToNotionEventsInYour')} </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t('seeEventsFromYourNotionDatabase')} </p>
          {denied && (
            <p role="alert" className="mt-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{t('notionConnectionWasCanceledPleaseTry')} </p>
          )}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-11 px-5">
              <a href={connectHref}>{t('connectNotionToGetStarted')} <ArrowRight aria-hidden="true" /></a>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-5">
              <a href="#how-it-works">{t('seeHowItWorks')}</a>
            </Button>
          </div>
          <div className="mt-6 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <p>{t('readOnlyNoSeparateEventStorage')}</p>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-muted-foreground">
            <span className="text-xs font-normal uppercase tracking-wider">{t('worksWith')}</span>
            <span>Google Calendar</span><span>Apple Calendar</span><span>Outlook</span>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section id="how-it-works" className="border-y bg-muted/30 scroll-mt-8">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <p className="text-sm font-semibold text-primary">{t('easySetup')}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t('justThreeSteps')}</h2>
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
            <p className="text-sm font-semibold text-primary">{t('keepYourWorkflow')}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance">{t('notionIsTheSourceYourCalendar')}</h2>
            <p className="mt-4 leading-7 text-muted-foreground">{t('keepManagingEventsInNotionAnd')}</p>
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
            [ShieldCheck, t('readOnlyAccess'), t('onlyTheNotionDatabasesYouAuthorize')],
            [RefreshCw, t('freshFromNotion'), t('yourLatestEventsAreFetchedWhen')],
            [Code2, t('openSource'), t('inspectTheCodeAndHostIt')],
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
            <p className="text-sm font-semibold text-primary">{t('frequentlyAskedQuestions')}</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{t('whatToKnowBeforeYouStart')}</h2>
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
        <h2 className="text-3xl font-semibold tracking-tight">{t('keepUpWithYourNotionEvents')}</h2>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-muted-foreground">{t('connectNotionAndSeeYourEvents')}</p>
        <Button asChild size="lg" className="mt-8 h-11 px-5">
          <a href={connectHref}>{t('getStartedForFree')} <ArrowRight aria-hidden="true" /></a>
        </Button>
      </section>

      <Footer />
    </main>
  )
}
