'use client'

import { Footer } from '@/components/Footer'
import { AppShell } from '@/components/AppShell'
import { ThemeToggle } from '@/components/ThemeToggle'

import { useTranslations } from '@/lib/i18n-client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { autoDetectMapping, type CalendarFilter } from '@/lib/mapping'
import { useServerState, useUser } from './useServerState'
import { FilterSection, type FilterRow as FilterRowData } from './FilterRow'
import Stepper from './Stepper'
import { Badge, Button, Input } from '@bini59/design'
import { LOGO_MARK_URL } from '@/lib/logo'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { CalendarDays, Check, Copy, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '' // "없음(-)" 옵션 값 — 선택 매핑 미지정
// Radix Select는 빈 문자열 value의 SelectItem을 금지 → "없음"에 센티넬을 쓰고 state는 NONE('') 유지.
const NONE_OPT = '__none__'

// 필터(#13/#16) 가능한 property 타입. relation(#16)은 이름 드롭다운을 별도 엔드포인트로 로딩한다.
const FILTER_TYPES = ['select', 'status', 'checkbox', 'relation']

// MVP: 통합에 공유된 DB 하나를 골라 → 필드 매핑 → 구독 캘린더 생성 (PLAN §3, 이슈 #5).
// feed URL은 문자열만 표시 — /feed/{token}.ics 라우트 실체는 #6.
function SetupView() {
  const t = useTranslations()
  // 서버 상태(databases/calendars/properties/relation 옵션/요청 결과)는 훅이 소유 — useServerState.ts 참고.
  const server = useServerState()
  const { databases, calendars, calendarsLoading, properties, relationState, needsConnect, error } = server

  // 클라이언트 상태: 위저드 진행, 폼 입력, 일시적 UI 표시.
  const [selected, setSelected] = useState<string>('')
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null) // rotate/delete/rename 진행 중인 항목 id
  const [submitting, setSubmitting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [loadingProps, setLoadingProps] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // 목록에서 편집 중인 캘린더 이름(id → 입력값)

  // 매핑 단계 폼 상태 — 서버 properties가 로드되면 매핑 폼으로 전환.
  const [name, setName] = useState('') // 캘린더 이름(#18) — DB 제목으로 pre-fill, 빈 값은 서버 폴백
  const [start, setStart] = useState('')
  const [end, setEnd] = useState(NONE)
  const [description, setDescription] = useState(NONE)
  // description 소스(#17): 'property'(기본, 아래 드롭다운) vs 'body'(페이지 본문 앞부분).
  const [descriptionSource, setDescriptionSource] = useState<'property' | 'body'>('property')
  const [location, setLocation] = useState(NONE)
  const [filterRows, setFilterRows] = useState<FilterRowData[]>([])

  const loadDatabases = () => {
    setSelected('')
    server.loadDatabases()
  }
  const loadCalendars = () => server.loadCalendars()

  async function withBusy(id: string, fn: () => Promise<unknown>) {
    setBusyId(id)
    try {
      await fn()
    } finally {
      setBusyId(null)
    }
  }

  async function loadProperties() {
    if (!selected) return
    setLoadingProps(true)
    const loaded = await server.loadProperties(selected)
    setLoadingProps(false)
    if (!loaded) return
    const auto = autoDetectMapping(loaded)
    // #18: 이름을 선택 DB 제목으로 pre-fill (서버 retrieve-database 왕복 회피, ponytail).
    setName(databases?.find((d) => d.id === selected)?.title ?? '')
    setStart(auto.start ?? '')
    setEnd(NONE)
    setDescription(NONE)
    setDescriptionSource('property')
    setLocation(NONE)
    setFilterRows([])
  }

  const dateProps = useMemo(
    () => (properties ?? []).filter((p) => p.type === 'date'),
    [properties],
  )
  const titleProp = useMemo(
    () => (properties ? autoDetectMapping(properties).title : undefined),
    [properties],
  )
  // 필터 가능한 속성만(#13 상한). 없으면 필터 섹션 자체를 숨긴다.
  const filterProps = useMemo(
    () => (properties ?? []).filter((p) => FILTER_TYPES.includes(p.type)),
    [properties],
  )
  const typeOfProp = (name: string) => properties?.find((p) => p.name === name)?.type
  // select/status 값 드롭다운(#15)에 쓸 옵션 목록. 없으면 자유텍스트 폴백 → undefined 반환.
  const optionsOfProp = (name: string) => properties?.find((p) => p.name === name)?.options

  // 필터 행 불변 조작 헬퍼.
  const updateRow = (i: number, patch: Partial<FilterRowData>) =>
    setFilterRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const addRow = () =>
    setFilterRows((rows) => [...rows, { property: '', condition: 'equals', value: '' }])
  const removeRow = (i: number) => setFilterRows((rows) => rows.filter((_, idx) => idx !== i))

  // relation 행(#16)이 생기면(클라 상태 filterRows) 서버 상태 훅에 옵션 로딩을 요청한다(property별 1회, 훅이 캐시/가드).
  useEffect(() => {
    const names = [
      ...new Set(
        filterRows.map((r) => r.property).filter((n) => n && typeOfProp(n) === 'relation'),
      ),
    ]
    names.forEach((name) => server.loadRelationOptions(name))
    // server/relationState는 가드용으로만 읽어 deps에서 제외(넣으면 매 set마다 재실행). filterRows/selected 변화에만 반응.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterRows, selected])

  // FilterRow → CalendarFilter. property 미선택 행은 버린다. checkbox는 value를 boolean으로.
  // 서버가 zod + validateMappingAgainstProperties로 재검증하므로 여기선 최소 조립만.
  function buildFilters(): CalendarFilter[] {
    return filterRows
      // 불완전 행 드롭: select/status는 값 필수(빈 값은 서버 filterSchema value.min(1)에서 거부돼
      // 엉뚱한 전체 mapping 400으로 표면화됨). checkbox는 value가 boolean이라 항상 유효.
      // relation(#16)은 is_empty/is_not_empty만 값 없이 유효, contains/does_not_contain은 값 필수.
      .filter((r) => {
        if (!r.property) return false
        const type = typeOfProp(r.property)
        if (type === 'checkbox') return true
        if (type === 'relation') {
          return r.condition === 'is_empty' || r.condition === 'is_not_empty' || !!r.value
        }
        return !!r.value // select/status
      })
      .map((r) => {
        const type = typeOfProp(r.property)
        if (type === 'checkbox') {
          return { type: 'checkbox', property: r.property, value: r.value === 'true' }
        }
        if (type === 'relation') {
          const noValue = r.condition === 'is_empty' || r.condition === 'is_not_empty'
          return {
            type: 'relation',
            property: r.property,
            condition: r.condition as 'contains' | 'does_not_contain' | 'is_empty' | 'is_not_empty',
            ...(noValue ? {} : { value: r.value }),
          }
        }
        return {
          type: type as 'select' | 'status',
          property: r.property,
          condition: r.condition as 'equals' | 'does_not_equal',
          value: r.value,
        }
      })
  }

  async function submit() {
    if (!titleProp || !start) return
    setSubmitting(true)
    try {
      const filters = buildFilters()
      const mapping = {
        title: titleProp,
        start,
        ...(end !== NONE ? { end } : {}),
        // 소스='body'면 descriptionSource만 보내고 property 이름은 생략(본문에서 채움). property면 기존 흐름.
        ...(descriptionSource === 'body'
          ? { descriptionSource: 'body' as const }
          : description !== NONE
            ? { description }
            : {}),
        ...(location !== NONE ? { location } : {}),
        ...(filters.length ? { filters } : {}),
      }
      const url = await server.createCalendar({ databaseId: selected, mapping, name })
      if (url !== undefined) setFeedUrl(url)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyUrl(url: string, id = url) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(id)
      window.setTimeout(() => setCopied((value) => (value === id ? null : value)), 2000)
    } catch {
      server.setError(t('couldNotCopyTheLinkPlease'))
    }
  }

  function openCreator() {
    setCreating(true)
    setFeedUrl(null)
    server.clearProperties()
  }

  function openDashboard() {
    setCreating(false)
    setFeedUrl(null)
    server.clearProperties()
    setSelected('')
    loadCalendars()
  }

  // 재발급/삭제: 확인을 받은 뒤 서버 상태 훅에 위임(캐시 갱신은 훅이 담당). 진행 표시(busyId)만 여기서 관리.
  // 두 진입점(생성 직후 화면 / 목록 항목)이 동일 함수를 재사용하도록 id를 인자로 받는다(#12).
  const rotate = (id: string) => withBusy(id, () => server.rotateCalendar(id))
  const remove = (id: string) => withBusy(id, () => server.deleteCalendar(id))

  // 이름 변경(#18): 입력 중인 값은 클라이언트 드래프트(drafts), 저장 성공 시 서버 캐시가 최종 이름으로 갱신되고
  // 드래프트는 폐기된다. 실패하면 드래프트가 남아 사용자가 다시 시도할 수 있다.
  const rename = (id: string, value: string) =>
    withBusy(id, async () => {
      if (await server.renameCalendar(id, value)) {
        setDrafts((d) => {
          const next = { ...d }
          delete next[id]
          return next
        })
      }
    })

  // 선택 매핑용 "없음" 센티넬 ↔ NONE('') 변환 Select. state는 NONE 유지 → payload 로직 불변.
  const noneSelectValue = (v: string) => (v === NONE ? NONE_OPT : v)
  const fromNoneSelect = (v: string) => (v === NONE_OPT ? NONE : v)

  if (needsConnect) {
    return (
      <Shell current={1}>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">{t('notionIsNotConnected')}</p>
          <Button variant="accent" onClick={() => window.location.assign('/api/auth/notion')}>{t('connectNotion54')} </Button>
        </div>
      </Shell>
    )
  }

  if (feedUrl) {
    return (
      <Shell current={3}>
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Check /></div>
        <h1 className="mb-2 text-2xl font-semibold">{t('yourCalendarIsReady')}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t('addTheLinkBelowAsA')}</p>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1"><Input aria-label={t('subscriptionUrl')} readOnly value={feedUrl} className="font-mono text-xs" /></div>
          <Button variant="accent" onClick={() => copyUrl(feedUrl, 'complete')}><Copy /><span aria-live="polite">{copied === 'complete' ? t('copied') : t('copyLink')}</span></Button>
        </div>
        <SubscriptionGuide />
        <p role="alert" className="my-5 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">{t('anyoneWithThisLinkCanSee')} </p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row"><Button variant="accent" onClick={openDashboard}>{t('goToMyCalendars')}</Button><Button variant="default" onClick={openCreator}>{t('createAnother')}</Button></div>
      </Shell>
    )
  }

  // 2단계: 필드 매핑
  if (properties !== null) {
    return (
      <Shell current={2}>
        <h1 className="mb-2 text-xl font-semibold">{t('chooseHowEventsAppear')}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t('chooseWhichNotionPropertiesToUse')}</p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {dateProps.length === 0 ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{t('thisDatabaseHasNoDateProperty')} </p>
        ) : !titleProp ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{t('thisDatabaseHasNoTitleProperty')} </p>
        ) : (
          <>
            {/* 캘린더 이름(#18) — 캘린더 앱에 표시될 이름(X-WR-CALNAME). DB 제목으로 pre-fill. */}
            <div className="mb-6 space-y-2">
              <Label htmlFor="cal-name" className="text-sm font-medium">{t('calendarName')} </Label>
              <Input
                id="cal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Notion Calendar"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">{t('thisNameAppearsInYourCalendar')}</p>
            </div>

            {/* 필수 그룹 */}
            <fieldset className="space-y-4">
              <legend className="mb-3 flex items-center gap-2 text-sm font-medium">{t('requiredFields')} <Badge tone="accent">{t('required')}</Badge>
              </legend>

              <MappingField label={t('eventTitle')} detail={t('calendarTitleSummary')}>
                <div className="flex items-center gap-2">
                  {/* title은 DB당 1개 → 자동 감지, 변경 불가 */}
                  <span className="text-sm font-medium">{titleProp}</span>
                  <Badge>{t('selectedAutomatically')}</Badge>
                </div>
              </MappingField>

              <MappingField label={t('eventDate')} detail={t('eventStartDtstart')}>
                <div className="flex items-center gap-2">
                  <Select value={start} onValueChange={setStart} disabled={dateProps.length === 1}>
                    <SelectTrigger aria-label={t('startDateProperty')} className="w-full">
                      <SelectValue placeholder={t('selectADateProperty')} />
                    </SelectTrigger>
                    <SelectContent>
                      {dateProps.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge tone="accent">{t('required')}</Badge>
                </div>
              </MappingField>
            </fieldset>

            <Separator className="my-6" />

            {/* 선택 그룹 */}
            <fieldset className="space-y-4">
              <legend className="mb-3 flex items-center gap-2 text-sm font-medium">{t('addMore')} <Badge>{t('optional')}</Badge>
              </legend>

              <MappingField label={t('endDate')} detail={t('eventEndDtend')}>
                <Select
                  value={noneSelectValue(end)}
                  onValueChange={(v) => setEnd(fromNoneSelect(v))}
                >
                  <SelectTrigger aria-label={t('endDateProperty')} className="w-full">
                    <SelectValue placeholder={t('none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPT}>{t('none84')}</SelectItem>
                    {dateProps.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MappingField>

              <MappingField label={t('eventDescription')} detail={t('descriptionDescription')}>
                <div className="space-y-3">
                  <ToggleGroup
                    type="single"
                    value={descriptionSource}
                    onValueChange={(v) => v && setDescriptionSource(v as 'property' | 'body')}
                    variant="default"
                    className="w-full"
                  >
                    <ToggleGroupItem value="property" className="flex-1">{t('fromAProperty')} </ToggleGroupItem>
                    <ToggleGroupItem value="body" className="flex-1">{t('fromThePageBody')} </ToggleGroupItem>
                  </ToggleGroup>
                  {descriptionSource === 'property' ? (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <Select
                        value={noneSelectValue(description)}
                        onValueChange={(v) => setDescription(fromNoneSelect(v))}
                      >
                        <SelectTrigger aria-label={t('descriptionProperty')} className="w-full">
                          <SelectValue placeholder={t('none')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_OPT}>{t('none84')}</SelectItem>
                          {properties.map((p) => (
                            <SelectItem key={p.name} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('useTheFirstFewBlocksOf')} </p>
                  )}
                </div>
              </MappingField>

              <MappingField label={t('location')} detail={t('eventLocationLocation')}>
                <Select
                  value={noneSelectValue(location)}
                  onValueChange={(v) => setLocation(fromNoneSelect(v))}
                >
                  <SelectTrigger aria-label={t('locationProperty')} className="w-full">
                    <SelectValue placeholder={t('none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPT}>{t('none84')}</SelectItem>
                    {properties.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MappingField>
            </fieldset>

            {filterProps.length > 0 && (
              <>
                <Separator className="my-6" />
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-medium">{t('advancedShowSpecificItems')}</summary>
                  <div className="mt-4"><FilterSection
                  rows={filterRows}
                  filterProps={filterProps}
                  typeOfProp={typeOfProp}
                  optionsOfProp={optionsOfProp}
                  relationState={relationState}
                  onUpdate={updateRow}
                  onAdd={addRow}
                  onRemove={removeRow}
                  /></div>
                </details>
              </>
            )}
          </>
        )}

        {/* sticky 푸터 바 */}
        <div className="sticky bottom-0 -mx-6 mt-8 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Button variant="ghost" onClick={server.clearProperties} disabled={submitting}>{t('back')} </Button>
          {titleProp && dateProps.length > 0 && (
            <Button variant="accent" onClick={submit} disabled={!start || submitting}>
              {submitting ? t('creating') : t('createCalendar')}
            </Button>
          )}
        </div>
      </Shell>
    )
  }

  if (!creating) {
    return (
      <Shell>
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">{t('myCalendars')}</h1><p className="mt-1 text-sm text-muted-foreground">{t('manageSubscriptionCalendarsConnectedToNotion')}</p></div>
          <Button variant="accent" onClick={openCreator}>{t('createACalendar')}</Button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {calendarsLoading && <div role="status" className="space-y-3"><span className="sr-only">{t('loadingCalendars')}</span><div className="h-44 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"/><div className="h-44 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"/></div>}
        {error && !calendarsLoading && <Button variant="default" className="mb-4" onClick={loadCalendars}>{t('tryAgain')}</Button>}
        {calendars?.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center"><CalendarDays className="mx-auto mb-3 text-muted-foreground"/><h2 className="font-medium">{t('noCalendarsYet')}</h2><p className="my-2 text-sm text-muted-foreground">{t('chooseANotionDatabaseToCreate')}</p><Button variant="accent" className="mt-3" onClick={openCreator}>{t('createACalendar')}</Button></div>}
        <ul className="space-y-4">
          {calendars?.map((cal) => {
            const dbTitle = databases?.find((db) => db.id === cal.databaseId)?.title ?? t('notionDatabase')
            return <li key={cal.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><Input aria-label={t('calendarName')} value={drafts[cal.id] ?? cal.name} maxLength={200} onChange={(e) => setDrafts((d) => ({ ...d, [cal.id]: e.target.value }))} className="max-w-sm font-semibold"/><p className="mt-2 truncate text-xs text-muted-foreground">Notion DB: {dbTitle} {t('title')}{cal.mapping.title}{t('date')}{cal.mapping.start}</p></div>
                <details className="relative"><summary className="list-none cursor-pointer rounded-md p-2 hover:bg-muted" aria-label={t('calendarOptions')}><MoreHorizontal className="size-5"/></summary><div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border bg-popover p-1 shadow-md"><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => rename(cal.id, drafts[cal.id] ?? cal.name)} disabled={!(drafts[cal.id] ?? cal.name).trim() || busyId === cal.id}>{t('saveName')}</Button>
                  <ConfirmAction title={t('issueANewLink')} description={t('theOldLinkWillStopWorking')} action={t('issueNewLink')} onConfirm={() => rotate(cal.id)}><Button variant="ghost" size="sm" className="w-full justify-start"><RefreshCw/> {t('issueNewLink112')}</Button></ConfirmAction>
                  <ConfirmAction title={t('deleteCalendar')} description={t('theSubscriptionLinkWillBePermanently')} action={t('deletePermanently')} onConfirm={() => remove(cal.id)}><Button variant="ghost" size="sm" className="w-full justify-start text-destructive"><Trash2/> {t('delete')}</Button></ConfirmAction>
                </div></details>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row"><div className="min-w-0 flex-1"><Input aria-label={t('calendarUrl').replace('{name}', cal.name)} readOnly value={cal.feedUrl} className="font-mono text-xs"/></div><Button variant="accent" onClick={() => copyUrl(cal.feedUrl, cal.id)}><Copy/><span aria-live="polite">{copied === cal.id ? t('copied') : t('copyLink')}</span></Button></div>
              <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">{t('howToAddToACalendar')}</summary><div className="mt-3"><SubscriptionGuide/></div></details>
            </li>
          })}
        </ul>
      </Shell>
    )
  }

  // 생성 마법사 1단계: DB 선택
  return (
    <Shell current={1}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-xl font-semibold">{t('chooseADatabaseForYourCalendar')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('onlyDatabasesSharedWithThisConnection')}</p></div><Button variant="default" size="sm" onClick={loadDatabases}><RefreshCw/>{t('refresh')}</Button></div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {databases === null && !error && <div role="status" className="space-y-2"><span className="sr-only">{t('loadingDatabases')}</span><div className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"/><div className="h-14 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"/></div>}
      {databases !== null && databases.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-medium">{t('noSharedDatabasesYet')}</h2><p className="my-2 text-sm text-muted-foreground">{t('addADatabaseToThisConnection')}</p><details className="mx-auto my-4 max-w-md text-left text-sm"><summary className="cursor-pointer font-medium">{t('howToConnect')}</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground"><li>{t('openTheDatabaseInNotion')}</li><li>{t('chooseConnectionsFromTheMenuIn')}</li><li>{t('findAndAddThisIntegrationThen')}</li></ol></details><Button variant="accent" onClick={loadDatabases}><RefreshCw/>{t('checkAgain')}</Button></div>
      )}
      {databases !== null && databases.length > 0 && (
        <>
          <ul className="mb-6 space-y-2" role="radiogroup" aria-label={t('chooseANotionDatabase')}>
            {databases.map((db) => (
              <li key={db.id}>
                <label
                  className={
                    'flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ' +
                    (selected === db.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted')
                  }
                >
                  <input
                    type="radio"
                    name="database"
                    value={db.id}
                    checked={selected === db.id}
                    onChange={() => setSelected(db.id)}
                    className="accent-primary"
                  />
                  {db.title || t('untitled')}
                </label>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 -mx-6 flex justify-between border-t bg-background/95 px-6 py-4"><Button variant="ghost" onClick={openDashboard}>{t('cancel')}</Button><Button variant="accent" onClick={loadProperties} disabled={!selected || loadingProps}>
            {loadingProps ? t('loading') : t('next')}
          </Button></div>
        </>
      )}
    </Shell>
  )
}

// max-width 640 중앙 컨테이너 + 상단 Stepper. 뷰마다 감싸는 공통 셸(<main>은 AppShell이 제공).
function Shell({ current, children }: { current?: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <div className={`mx-auto w-full px-6 py-2 ${current ? 'max-w-[640px]' : 'max-w-[840px]'}`}>
      {current && <Stepper current={current} />}
      {children}
    </div>
  )
}

// 로그인 사용자(/api/me)로 AppShell을 구성하고, 기존 화면은 그 안에 렌더한다. 인증 자체는 proxy.ts가 보장.
export default function Setup() {
  const t = useTranslations()
  const user = useUser()

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => undefined)
    window.location.assign('/')
  }

  return (
    <AppShell
      brand={{
        mark: <img alt="" className="size-full object-cover" src={LOGO_MARK_URL} />,
        name: 'Notion Calendar',
        host: 'n2c.bini59.dev',
        href: '/setup',
      }}
      nav={[{ id: 'calendars', label: t('myCalendars'), icon: <CalendarDays className="size-4" />, href: '/setup' }]}
      activeId="calendars"
      user={user}
      onLogout={logout}
      profilePlacement="sidebar"
      sidebarFoot={<ThemeToggle />}
      crumb={<strong>{t('myCalendars')}</strong>}
    >
      <SetupView />
      <section aria-label={t('account')} className="mx-auto max-w-[840px] px-6 py-8"><h2 className="mb-3 font-semibold">{t('account')}</h2><Link href="/account" className="text-sm text-destructive underline">{t('leaveTheCalendarService')}</Link></section>
      <Footer />
    </AppShell>
  )
}

function MappingField({ label, detail, children }: { label: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-3">
      <div><Label className="text-sm font-medium">{label}</Label><p className="text-xs text-muted-foreground">{detail}</p></div>
      <div>{children}</div>
    </div>
  )
}

function SubscriptionGuide() {
  const t = useTranslations()
  return <div className="grid gap-2 sm:grid-cols-3">
    <div className="rounded-lg border p-3"><strong className="text-sm">Google</strong><p className="mt-1 text-xs text-muted-foreground">{t('pasteTheLinkUnderOtherCalendars')}</p></div>
    <div className="rounded-lg border p-3"><strong className="text-sm">Apple</strong><p className="mt-1 text-xs text-muted-foreground">{t('pasteTheLinkUnderFileNew')}</p></div>
    <div className="rounded-lg border p-3"><strong className="text-sm">Outlook</strong><p className="mt-1 text-xs text-muted-foreground">{t('pasteTheLinkUnderAddCalendar')}</p></div>
  </div>
}

function ConfirmAction({ title, description, action, onConfirm, children }: { title: string; description: string; action: string; onConfirm: () => void; children: React.ReactNode }) {
  const t = useTranslations()
  return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription><div className="mt-6 flex justify-end gap-2"><AlertDialogCancel>{t('cancel')}</AlertDialogCancel><AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction></div></AlertDialogContent></AlertDialog>
}
