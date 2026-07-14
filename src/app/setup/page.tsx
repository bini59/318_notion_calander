'use client'

import { useEffect, useMemo, useState } from 'react'
import { autoDetectMapping, type CalendarFilter, type CalendarMapping, type NotionProperty } from '@/lib/mapping'
import { FilterSection, type FilterRow as FilterRowData } from './FilterRow'
import Stepper from './Stepper'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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

type Database = { id: string; title: string }
type Calendar = { id: string; name: string; feedUrl: string; databaseId: string; mapping: CalendarMapping }
// relation(#16) 값 드롭다운 원본: 관련 DB 페이지 목록의 로딩/에러/결과를 property 이름별로 캐시.
type RelationState = { loading?: boolean; error?: string; options?: { id: string; title: string }[] }

const NONE = '' // "없음(-)" 옵션 값 — 선택 매핑 미지정
// Radix Select는 빈 문자열 value의 SelectItem을 금지 → "없음"에 센티넬을 쓰고 state는 NONE('') 유지.
const NONE_OPT = '__none__'

// 필터(#13/#16) 가능한 property 타입. relation(#16)은 이름 드롭다운을 별도 엔드포인트로 로딩한다.
const FILTER_TYPES = ['select', 'status', 'checkbox', 'relation']

// MVP: 통합에 공유된 DB 하나를 골라 → 필드 매핑 → 구독 캘린더 생성 (PLAN §3, 이슈 #5).
// feed URL은 문자열만 표시 — /feed/{token}.ics 라우트 실체는 #6.
export default function Setup() {
  const [databases, setDatabases] = useState<Database[] | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [feedUrl, setFeedUrl] = useState<string | null>(null)
  const [calendars, setCalendars] = useState<Calendar[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null) // rotate/delete 진행 중인 항목 id
  const [error, setError] = useState<string | null>(null)
  const [needsConnect, setNeedsConnect] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  // 매핑 단계 상태 — properties가 로드되면 매핑 폼으로 전환.
  const [properties, setProperties] = useState<NotionProperty[] | null>(null)
  const [loadingProps, setLoadingProps] = useState(false)
  const [name, setName] = useState('') // 캘린더 이름(#18) — DB 제목으로 pre-fill, 빈 값은 서버 폴백
  const [start, setStart] = useState('')
  const [end, setEnd] = useState(NONE)
  const [description, setDescription] = useState(NONE)
  // description 소스(#17): 'property'(기본, 아래 드롭다운) vs 'body'(페이지 본문 앞부분).
  const [descriptionSource, setDescriptionSource] = useState<'property' | 'body'>('property')
  const [location, setLocation] = useState(NONE)
  const [filterRows, setFilterRows] = useState<FilterRowData[]>([])
  // relation 옵션 캐시(#16): property 이름 → 로딩/에러/결과. 행이 relation으로 바뀌면 1회 fetch.
  const [relationState, setRelationState] = useState<Record<string, RelationState>>({})

  const loadDatabases = () => {
    setDatabases(null)
    setError(null)
    fetch('/api/databases')
      .then(async (res) => {
        if (res.status === 401) {
          setNeedsConnect(true)
          return
        }
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다')
        const { databases } = (await res.json()) as { databases: Database[] }
        setDatabases(databases)
      })
      .catch((e: Error) => setError(e.message))
  }

  useEffect(() => {
    fetch('/api/databases')
      .then(async (res) => {
        if (res.status === 401) { setNeedsConnect(true); return }
        if (!res.ok) throw new Error('목록을 불러오지 못했습니다')
        const { databases } = (await res.json()) as { databases: Database[] }
        setDatabases(databases)
      })
      .catch((e: Error) => setError(e.message))
    // initial load only
  }, [])

  // 기존에 만든 "내 캘린더" 목록 로드 (이슈 #12). DB 목록과 병렬 — 401은 동일하게 재연결 유도.
  useEffect(() => {
    fetch('/api/calendars')
      .then(async (res) => {
        if (res.status === 401) {
          setNeedsConnect(true)
          return
        }
        if (!res.ok) throw new Error('캘린더 목록을 불러오지 못했습니다')
        const { calendars } = (await res.json()) as { calendars: Calendar[] }
        setCalendars(calendars)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  // ponytail: N+1 회피 — properties는 사용자가 고른 DB 하나만 이 시점에 1회 조회.
  async function loadProperties() {
    if (!selected) return
    setLoadingProps(true)
    setError(null)
    try {
      const res = await fetch(`/api/databases/${selected}`)
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      if (!res.ok) throw new Error('속성을 불러오지 못했습니다')
      const { properties } = (await res.json()) as { properties: NotionProperty[] }
      const auto = autoDetectMapping(properties)
      // #18: 이름을 선택 DB 제목으로 pre-fill (서버 retrieve-database 왕복 회피, ponytail).
      setName(databases?.find((d) => d.id === selected)?.title ?? '')
      setStart(auto.start ?? '')
      setEnd(NONE)
      setDescription(NONE)
      setDescriptionSource('property')
      setLocation(NONE)
      setFilterRows([])
      setRelationState({})
      setProperties(properties)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingProps(false)
    }
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

  // relation 행(#16)의 관련 페이지 이름 옵션을 property별로 1회 로딩·캐시한다. 신뢰경계: 클라는 관련
  // DB id를 넘기지 않고 (선택 DB, property)만 보내며 서버가 relatedDatabaseId를 재도출한다.
  // relationState[name]이 이미 있으면(로딩/성공/에러) 재요청하지 않아 루프를 막는다.
  useEffect(() => {
    const names = [
      ...new Set(
        filterRows.map((r) => r.property).filter((n) => n && typeOfProp(n) === 'relation'),
      ),
    ]
    names.forEach((name) => {
      if (relationState[name]) return
      setRelationState((s) => ({ ...s, [name]: { loading: true } }))
      fetch(`/api/databases/${selected}/relation-options?property=${encodeURIComponent(name)}`)
        .then(async (res) => {
          if (!res.ok) throw new Error('관련 페이지 목록을 불러오지 못했습니다')
          const { options } = (await res.json()) as { options: { id: string; title: string }[] }
          setRelationState((s) => ({ ...s, [name]: { options } }))
        })
        .catch((e: Error) => setRelationState((s) => ({ ...s, [name]: { error: e.message } })))
    })
    // relationState는 가드용으로만 읽어 deps에서 제외(넣으면 매 set마다 재실행). filterRows/selected 변화에만 반응.
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
    setError(null)
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
      const res = await fetch('/api/calendars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ databaseId: selected, mapping, name }),
      })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      const data = (await res.json()) as { id?: string; feedUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '캘린더 생성에 실패했습니다')
      setFeedUrl(data.feedUrl ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  async function copyUrl(url: string, id = url) {
    await navigator.clipboard.writeText(url)
    setCopied(id)
    window.setTimeout(() => setCopied((value) => (value === id ? null : value)), 2000)
  }

  function openCreator() {
    setCreating(true)
    setFeedUrl(null)
    setProperties(null)
    window.history.replaceState(null, '', '/setup?new=1')
  }

  function openDashboard() {
    setCreating(false)
    setFeedUrl(null)
    setProperties(null)
    setSelected('')
    window.history.replaceState(null, '', '/setup')
    fetch('/api/calendars').then((r) => r.json()).then(({ calendars }) => setCalendars(calendars)).catch(() => {})
  }

  // 재발급: 기존 URL을 즉시 무효화하므로 확인을 받는다. 성공 시 새 feedUrl로 교체.
  // 두 진입점(생성 직후 화면 / 목록 항목)이 동일 함수를 재사용하도록 id를 인자로 받는다(#12).
  async function rotate(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/calendars/${id}/rotate`, { method: 'POST' })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      const data = (await res.json()) as { feedUrl?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '재발급에 실패했습니다')
      const newUrl = data.feedUrl ?? null
      // 목록 항목: 해당 캘린더의 feedUrl만 불변 교체.
      setCalendars((prev) =>
        prev ? prev.map((c) => (c.id === id && newUrl ? { ...c, feedUrl: newUrl } : c)) : prev,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  // 삭제: 구독 URL을 영구 무효화하므로 확인을 받는다. 성공(204) 시 목록에서 불변 제거(#12).
  async function remove(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      if (!res.ok) throw new Error('삭제에 실패했습니다')
      setCalendars((prev) => (prev ? prev.filter((c) => c.id !== id) : prev))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  // 이름 변경(#18). 목록 Input을 그대로 controlled로 쓰므로 값은 이미 calendars state에 있음 — id만 받아 PATCH.
  // ponytail: 실패 시 옛 이름으로 revert 안 함(원본 미보관) — 표시 라벨이라 무해, 새로고침이 서버값으로 정정.
  async function rename(id: string, value: string) {
    setBusyId(id)
    setError(null)
    try {
      const res = await fetch(`/api/calendars/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: value }),
      })
      if (res.status === 401) {
        setNeedsConnect(true)
        return
      }
      const data = (await res.json()) as { name?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '이름 변경에 실패했습니다')
      // 서버가 trim/폴백한 최종 이름으로 교체(불변).
      setCalendars((prev) =>
        prev ? prev.map((c) => (c.id === id && data.name ? { ...c, name: data.name } : c)) : prev,
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  // 선택 매핑용 "없음" 센티넬 ↔ NONE('') 변환 Select. state는 NONE 유지 → payload 로직 불변.
  const noneSelectValue = (v: string) => (v === NONE ? NONE_OPT : v)
  const fromNoneSelect = (v: string) => (v === NONE_OPT ? NONE : v)

  if (needsConnect) {
    return (
      <Shell current={1}>
        <div className="rounded-lg border border-border bg-card p-6 text-center">
          <p className="mb-4 text-sm text-muted-foreground">Notion이 연결되지 않았습니다.</p>
          <Button asChild>
            <a href="/api/auth/notion">Notion 연결하기</a>
          </Button>
        </div>
      </Shell>
    )
  }

  if (feedUrl) {
    return (
      <Shell current={3}>
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Check /></div>
        <h1 className="mb-2 text-2xl font-semibold">캘린더가 준비됐어요</h1>
        <p className="mb-6 text-sm text-muted-foreground">아래 링크를 캘린더 앱에 구독으로 추가하면 끝이에요.</p>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <Input aria-label="구독 URL" readOnly value={feedUrl} className="font-mono text-xs" />
          <Button onClick={() => copyUrl(feedUrl, 'complete')}><Copy /><span aria-live="polite">{copied === 'complete' ? '복사했어요' : '링크 복사'}</span></Button>
        </div>
        <SubscriptionGuide />
        <p role="alert" className="my-5 rounded-md bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
          이 링크를 아는 사람은 누구나 일정을 볼 수 있어요. 공개적으로 공유하지 마세요. 유출됐다면 관리 화면에서 새 링크를 발급할 수 있습니다.
        </p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row"><Button onClick={openDashboard}>내 캘린더로 가기</Button><Button variant="outline" onClick={openCreator}>하나 더 만들기</Button></div>
      </Shell>
    )
  }

  // 2단계: 필드 매핑
  if (properties !== null) {
    return (
      <Shell current={2}>
        <h1 className="mb-2 text-xl font-semibold">캘린더에 어떻게 표시할지 정하세요</h1>
        <p className="mb-6 text-sm text-muted-foreground">Notion의 어떤 속성을 일정의 어떤 부분으로 쓸지 골라주세요.</p>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}

        {dateProps.length === 0 ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            이 DB에는 날짜(date) 속성이 없어 캘린더로 만들 수 없습니다. Notion에서 날짜 속성을 추가한
            뒤 다시 시도하세요.
          </p>
        ) : !titleProp ? (
          <p role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            이 DB에는 제목(title) 속성이 없어 캘린더로 만들 수 없습니다.
          </p>
        ) : (
          <>
            {/* 캘린더 이름(#18) — 캘린더 앱에 표시될 이름(X-WR-CALNAME). DB 제목으로 pre-fill. */}
            <div className="mb-6 space-y-2">
              <Label htmlFor="cal-name" className="text-sm font-medium">
                캘린더 이름
              </Label>
              <Input
                id="cal-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Notion Calendar"
                maxLength={200}
              />
              <p className="text-xs text-muted-foreground">캘린더 앱에 표시될 이름입니다.</p>
            </div>

            {/* 필수 그룹 */}
            <fieldset className="space-y-4">
              <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
                꼭 필요한 항목 <Badge>필수</Badge>
              </legend>

              <MappingField label="일정 제목" detail="캘린더의 제목(SUMMARY)">
                <div className="flex items-center gap-2">
                  {/* title은 DB당 1개 → 자동 감지, 변경 불가 */}
                  <span className="text-sm font-medium">{titleProp}</span>
                  <Badge variant="secondary">자동 선택됨</Badge>
                </div>
              </MappingField>

              <MappingField label="일정 날짜" detail="일정의 시작일(DTSTART)">
                <div className="flex items-center gap-2">
                  <Select value={start} onValueChange={setStart} disabled={dateProps.length === 1}>
                    <SelectTrigger aria-label="시작일 속성" className="w-full">
                      <SelectValue placeholder="date 속성 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {dateProps.map((p) => (
                        <SelectItem key={p.name} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge>필수</Badge>
                </div>
              </MappingField>
            </fieldset>

            <Separator className="my-6" />

            {/* 선택 그룹 */}
            <fieldset className="space-y-4">
              <legend className="mb-3 flex items-center gap-2 text-sm font-medium">
                더 넣기 <Badge variant="secondary">선택</Badge>
              </legend>

              <MappingField label="종료 날짜" detail="일정의 종료일(DTEND)">
                <Select
                  value={noneSelectValue(end)}
                  onValueChange={(v) => setEnd(fromNoneSelect(v))}
                >
                  <SelectTrigger aria-label="종료일 속성" className="w-full">
                    <SelectValue placeholder="없음" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPT}>없음(-)</SelectItem>
                    {dateProps.map((p) => (
                      <SelectItem key={p.name} value={p.name}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </MappingField>

              <MappingField label="일정 설명" detail="상세 설명(DESCRIPTION)">
                <div className="space-y-3">
                  <ToggleGroup
                    type="single"
                    value={descriptionSource}
                    onValueChange={(v) => v && setDescriptionSource(v as 'property' | 'body')}
                    variant="outline"
                    className="w-full"
                  >
                    <ToggleGroupItem value="property" className="flex-1">
                      속성에서
                    </ToggleGroupItem>
                    <ToggleGroupItem value="body" className="flex-1">
                      페이지 본문에서
                    </ToggleGroupItem>
                  </ToggleGroup>
                  {descriptionSource === 'property' ? (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <Select
                        value={noneSelectValue(description)}
                        onValueChange={(v) => setDescription(fromNoneSelect(v))}
                      >
                        <SelectTrigger aria-label="설명 속성" className="w-full">
                          <SelectValue placeholder="없음" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_OPT}>없음(-)</SelectItem>
                          {properties.map((p) => (
                            <SelectItem key={p.name} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      페이지 본문의 앞부분(최대 몇 블록)을 설명으로 사용합니다.
                    </p>
                  )}
                </div>
              </MappingField>

              <MappingField label="장소" detail="일정 장소(LOCATION)">
                <Select
                  value={noneSelectValue(location)}
                  onValueChange={(v) => setLocation(fromNoneSelect(v))}
                >
                  <SelectTrigger aria-label="장소 속성" className="w-full">
                    <SelectValue placeholder="없음" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_OPT}>없음(-)</SelectItem>
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
                  <summary className="cursor-pointer text-sm font-medium">고급: 특정 항목만 보이기</summary>
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
          <Button variant="ghost" onClick={() => setProperties(null)} disabled={submitting}>
            뒤로
          </Button>
          {titleProp && dateProps.length > 0 && (
            <Button onClick={submit} disabled={!start || submitting}>
              {submitting ? '생성 중…' : '캘린더 만들기'}
            </Button>
          )}
        </div>
      </Shell>
    )
  }

  if (!creating) {
    return (
      <Shell>
        <div className="mb-7 flex items-center justify-between gap-4">
          <div><h1 className="text-2xl font-semibold">내 캘린더</h1><p className="mt-1 text-sm text-muted-foreground">Notion과 연결된 구독 캘린더를 관리하세요.</p></div>
          <Button onClick={openCreator}>새 캘린더 만들기</Button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
        {calendars === null && <div aria-label="캘린더 불러오는 중" className="space-y-3"><div className="h-44 animate-pulse rounded-xl bg-muted"/><div className="h-44 animate-pulse rounded-xl bg-muted"/></div>}
        {calendars?.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center"><CalendarDays className="mx-auto mb-3 text-muted-foreground"/><h2 className="font-medium">아직 만든 캘린더가 없어요</h2><p className="my-2 text-sm text-muted-foreground">Notion 데이터베이스를 골라 첫 캘린더를 만들어 보세요.</p><Button className="mt-3" onClick={openCreator}>새 캘린더 만들기</Button></div>}
        <ul className="space-y-4">
          {calendars?.map((cal) => {
            const dbTitle = databases?.find((db) => db.id === cal.databaseId)?.title ?? 'Notion 데이터베이스'
            return <li key={cal.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1"><Input aria-label="캘린더 이름" value={cal.name} maxLength={200} onChange={(e) => setCalendars((prev) => prev?.map((c) => c.id === cal.id ? {...c, name:e.target.value}:c) ?? null)} className="max-w-sm font-semibold"/><p className="mt-2 truncate text-xs text-muted-foreground">Notion DB: {dbTitle} · 제목={cal.mapping.title}, 날짜={cal.mapping.start}</p></div>
                <details className="relative"><summary className="list-none cursor-pointer rounded-md p-2 hover:bg-muted" aria-label="캘린더 더보기"><MoreHorizontal className="size-5"/></summary><div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border bg-popover p-1 shadow-md"><Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => rename(cal.id, cal.name)} disabled={!cal.name.trim() || busyId === cal.id}>이름 저장</Button>
                  <ConfirmAction title="새 링크를 발급할까요?" description="기존 링크는 즉시 작동을 멈춰요. 구독한 캘린더 앱에도 새 링크를 다시 추가해야 합니다." action="새 링크 발급" onConfirm={() => rotate(cal.id)}><Button variant="ghost" size="sm" className="w-full justify-start"><RefreshCw/> 링크 재발급</Button></ConfirmAction>
                  <ConfirmAction title="캘린더를 삭제할까요?" description="구독 링크가 영구적으로 사라지며 되돌릴 수 없습니다." action="영구 삭제" onConfirm={() => remove(cal.id)}><Button variant="ghost" size="sm" className="w-full justify-start text-destructive"><Trash2/> 삭제</Button></ConfirmAction>
                </div></details>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row"><Input aria-label={`${cal.name} 구독 URL`} readOnly value={cal.feedUrl} className="font-mono text-xs"/><Button onClick={() => copyUrl(cal.feedUrl, cal.id)}><Copy/><span aria-live="polite">{copied === cal.id ? '복사했어요' : '링크 복사'}</span></Button></div>
              <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">캘린더 앱에 추가하는 방법</summary><div className="mt-3"><SubscriptionGuide/></div></details>
            </li>
          })}
        </ul>
      </Shell>
    )
  }

  // 생성 마법사 1단계: DB 선택
  return (
    <Shell current={1}>
      <div className="mb-6 flex items-start justify-between"><div><h1 className="text-xl font-semibold">캘린더로 만들 데이터베이스를 고르세요</h1><p className="mt-2 text-sm text-muted-foreground">이 연결에 공유한 Notion 데이터베이스만 보여요.</p></div><Button variant="outline" size="sm" onClick={loadDatabases}><RefreshCw/>새로고침</Button></div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {databases === null && !error && <div aria-label="데이터베이스 불러오는 중" className="space-y-2"><div className="h-14 animate-pulse rounded-lg bg-muted"/><div className="h-14 animate-pulse rounded-lg bg-muted"/></div>}
      {databases !== null && databases.length === 0 && (
        <div className="rounded-xl border border-dashed p-8 text-center"><h2 className="font-medium">아직 공유된 데이터베이스가 없어요</h2><p className="my-2 text-sm text-muted-foreground">Notion에서 이 연결에 데이터베이스를 추가하면 여기에 나타납니다.</p><details className="mx-auto my-4 max-w-md text-left text-sm"><summary className="cursor-pointer font-medium">연결 방법 보기</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground"><li>Notion에서 데이터베이스를 엽니다.</li><li>오른쪽 위 ··· 메뉴에서 연결을 선택합니다.</li><li>이 통합을 찾아 추가한 뒤 여기서 다시 확인합니다.</li></ol></details><Button onClick={loadDatabases}><RefreshCw/>다시 확인</Button></div>
      )}
      {databases !== null && databases.length > 0 && (
        <>
          <ul className="mb-6 space-y-2" role="radiogroup" aria-label="Notion DB 선택">
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
                  {db.title || '(제목 없음)'}
                </label>
              </li>
            ))}
          </ul>
          <div className="sticky bottom-0 -mx-6 flex justify-between border-t bg-background/95 px-6 py-4"><Button variant="ghost" onClick={openDashboard}>취소</Button><Button onClick={loadProperties} disabled={!selected || loadingProps}>
            {loadingProps ? '불러오는 중…' : '다음'}
          </Button></div>
        </>
      )}
    </Shell>
  )
}

// max-width 640 중앙 컨테이너 + 상단 Stepper. 뷰마다 감싸는 공통 셸.
function Shell({ current, children }: { current?: 1 | 2 | 3; children: React.ReactNode }) {
  return (
    <main className={`mx-auto w-full px-6 py-10 ${current ? 'max-w-[640px]' : 'max-w-[840px]'}`}>
      {current && <Stepper current={current} />}
      {children}
    </main>
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
  return <div className="grid gap-2 sm:grid-cols-3">
    <div className="rounded-lg border p-3"><strong className="text-sm">Google</strong><p className="mt-1 text-xs text-muted-foreground">다른 캘린더 + → URL로 추가에 링크를 붙여넣으세요.</p></div>
    <div className="rounded-lg border p-3"><strong className="text-sm">Apple</strong><p className="mt-1 text-xs text-muted-foreground">파일 → 새로운 캘린더 구독에 링크를 붙여넣으세요.</p></div>
    <div className="rounded-lg border p-3"><strong className="text-sm">Outlook</strong><p className="mt-1 text-xs text-muted-foreground">캘린더 추가 → 웹에서 구독에 링크를 붙여넣으세요.</p></div>
  </div>
}

function ConfirmAction({ title, description, action, onConfirm, children }: { title: string; description: string; action: string; onConfirm: () => void; children: React.ReactNode }) {
  return <AlertDialog><AlertDialogTrigger asChild>{children}</AlertDialogTrigger><AlertDialogContent><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{description}</AlertDialogDescription><div className="mt-6 flex justify-end gap-2"><AlertDialogCancel/><AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction></div></AlertDialogContent></AlertDialog>
}
