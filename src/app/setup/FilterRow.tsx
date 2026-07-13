// 필터(#13/#16) UI. setup/page.tsx의 per-row JSX를 순수 컴포넌트로 추출(page.tsx 축소).
// 상태·로딩은 부모가 소유하고 여기선 props로만 렌더 — select/status/checkbox/relation 동작 불변,
// 마크업만 shadcn 프리미티브로 교체. property는 이름, condition/value는 서버 상한과 동일(value는 문자열 보관).

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// relation은 조건이 4종이라 select/status의 2종과 다르다 → condition은 두 집합의 유니온.
export type FilterRowCondition =
  | 'equals'
  | 'does_not_equal'
  | 'contains'
  | 'does_not_contain'
  | 'is_empty'
  | 'is_not_empty'

export type FilterRow = { property: string; condition: FilterRowCondition; value: string }

// relation 값(관련 페이지 이름) 드롭다운의 원본 — 부모가 relation-options 엔드포인트로 로딩해 주입.
type RelationState = { loading?: boolean; error?: string; options?: { id: string; title: string }[] }

type FilterProp = { name: string; type: string }

type RowProps = {
  row: FilterRow
  index: number
  filterProps: FilterProp[]
  typeOfProp: (name: string) => string | undefined
  optionsOfProp: (name: string) => { name: string }[] | undefined
  relationOptions?: RelationState
  onUpdate: (i: number, patch: Partial<FilterRow>) => void
  onRemove: (i: number) => void
}

// relation은 value 없는 조건(is_empty/is_not_empty)이 있어 값 컨트롤 표시 여부를 조건으로 가른다.
const RELATION_EMPTY_CONDS = ['is_empty', 'is_not_empty'] as const

export default function FilterRow({
  row,
  index: i,
  filterProps,
  typeOfProp,
  optionsOfProp,
  relationOptions,
  onUpdate,
  onRemove,
}: RowProps) {
  const rowType = typeOfProp(row.property)
  const relationNeedsValue =
    rowType === 'relation' && !RELATION_EMPTY_CONDS.includes(row.condition as 'is_empty')

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={row.property}
        onValueChange={(property) => {
          const t = typeOfProp(property)
          // 타입별 기본값: checkbox는 value='true', relation은 조건 contains(값 필요), 그 외는 equals.
          const patch: Partial<FilterRow> =
            t === 'checkbox'
              ? { property, value: 'true' }
              : t === 'relation'
                ? { property, condition: 'contains', value: '' }
                : { property, condition: 'equals', value: '' }
          onUpdate(i, patch)
        }}
      >
        <SelectTrigger aria-label={`필터 ${i + 1} 속성`} className="min-w-36 flex-1" size="sm">
          <SelectValue placeholder="속성 선택" />
        </SelectTrigger>
        <SelectContent>
          {filterProps.map((p) => (
            <SelectItem key={p.name} value={p.name}>
              {p.name} ({p.type})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {rowType === 'checkbox' ? (
        <Select
          value={row.value}
          onValueChange={(value) => onUpdate(i, { value })}
        >
          <SelectTrigger aria-label={`필터 ${i + 1} 값`} className="min-w-32 flex-1" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">체크됨</SelectItem>
            <SelectItem value="false">체크 안 됨</SelectItem>
          </SelectContent>
        </Select>
      ) : rowType === 'relation' ? (
        <>
          <Select
            value={row.condition}
            onValueChange={(v) => onUpdate(i, { condition: v as FilterRowCondition })}
          >
            <SelectTrigger aria-label={`필터 ${i + 1} 조건`} className="min-w-28" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="contains">포함</SelectItem>
              <SelectItem value="does_not_contain">미포함</SelectItem>
              <SelectItem value="is_empty">비어 있음</SelectItem>
              <SelectItem value="is_not_empty">비어 있지 않음</SelectItem>
            </SelectContent>
          </Select>
          {relationNeedsValue &&
            (relationOptions?.loading ? (
              <span className="text-sm text-muted-foreground">관련 페이지 불러오는 중…</span>
            ) : relationOptions?.error ? (
              <span role="alert" className="text-sm text-destructive">
                {relationOptions.error}
              </span>
            ) : (
              <Select value={row.value} onValueChange={(value) => onUpdate(i, { value })}>
                <SelectTrigger aria-label={`필터 ${i + 1} 값`} className="min-w-40 flex-1" size="sm">
                  <SelectValue placeholder="관련 페이지 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(relationOptions?.options ?? []).map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title || '(제목 없음)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ))}
        </>
      ) : (
        <>
          <Select
            value={row.condition}
            onValueChange={(v) => onUpdate(i, { condition: v as FilterRowCondition })}
          >
            <SelectTrigger aria-label={`필터 ${i + 1} 조건`} className="min-w-20" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">=</SelectItem>
              <SelectItem value="does_not_equal">≠</SelectItem>
            </SelectContent>
          </Select>
          {optionsOfProp(row.property)?.length ? (
            <Select value={row.value} onValueChange={(value) => onUpdate(i, { value })}>
              <SelectTrigger aria-label={`필터 ${i + 1} 값`} className="min-w-32 flex-1" size="sm">
                <SelectValue placeholder="값 선택" />
              </SelectTrigger>
              <SelectContent>
                {optionsOfProp(row.property)!.map((o) => (
                  <SelectItem key={o.name} value={o.name}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              aria-label={`필터 ${i + 1} 값`}
              value={row.value}
              placeholder="값 (예: Done)"
              onChange={(e) => onUpdate(i, { value: e.target.value })}
              className="min-w-32 flex-1"
            />
          )}
        </>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`필터 ${i + 1} 삭제`}
        onClick={() => onRemove(i)}
      >
        ✕
      </Button>
    </div>
  )
}

type SectionProps = {
  rows: FilterRow[]
  filterProps: FilterProp[]
  typeOfProp: (name: string) => string | undefined
  optionsOfProp: (name: string) => { name: string }[] | undefined
  relationState: Record<string, RelationState>
  onUpdate: (i: number, patch: Partial<FilterRow>) => void
  onAdd: () => void
  onRemove: (i: number) => void
}

// 필터 섹션: 헤더 + 헬퍼 + 빈 상태 + 행(사이 AND 커넥터) + "+ 필터 추가".
export function FilterSection({
  rows,
  filterProps,
  typeOfProp,
  optionsOfProp,
  relationState,
  onUpdate,
  onAdd,
  onRemove,
}: SectionProps) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">필터</legend>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        조건에 맞는 항목만 캘린더에 표시됩니다 (모든 조건 AND)
      </p>

      {rows.length === 0 ? (
        <p className="mb-4 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          필터 없음 — 모든 항목이 표시됩니다
        </p>
      ) : (
        <div className="mb-4 space-y-2">
          {rows.map((row, i) => (
            <div key={i}>
              {i > 0 && (
                <div className="mb-2 text-xs font-medium text-muted-foreground" aria-hidden>
                  AND
                </div>
              )}
              <FilterRow
                row={row}
                index={i}
                filterProps={filterProps}
                typeOfProp={typeOfProp}
                optionsOfProp={optionsOfProp}
                relationOptions={relationState[row.property]}
                onUpdate={onUpdate}
                onRemove={onRemove}
              />
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" onClick={onAdd}>
        + 필터 추가
      </Button>
    </fieldset>
  )
}
