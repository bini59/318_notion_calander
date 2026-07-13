// 필터(#13/#16) UI의 한 행. setup/page.tsx의 per-row JSX를 순수 컴포넌트로 추출(page.tsx 축소).
// 상태·로딩은 부모가 소유하고 여기선 props로만 렌더 — select/status/checkbox 기존 동작 불변,
// relation(#16) 브랜치 추가. property는 이름, condition/value는 서버 상한과 동일(value는 문자열 보관).

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

type Props = {
  row: FilterRow
  index: number
  filterProps: { name: string; type: string }[]
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
}: Props) {
  const rowType = typeOfProp(row.property)
  const relationNeedsValue =
    rowType === 'relation' && !RELATION_EMPTY_CONDS.includes(row.condition as 'is_empty')

  return (
    <p>
      <select
        aria-label={`필터 ${i + 1} 속성`}
        value={row.property}
        onChange={(e) => {
          const property = e.target.value
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
        <option value="">속성 선택</option>
        {filterProps.map((p) => (
          <option key={p.name} value={p.name}>
            {p.name} ({p.type})
          </option>
        ))}
      </select>{' '}
      {rowType === 'checkbox' ? (
        <select
          aria-label={`필터 ${i + 1} 값`}
          value={row.value}
          onChange={(e) => onUpdate(i, { value: e.target.value })}
        >
          <option value="true">체크됨</option>
          <option value="false">체크 안 됨</option>
        </select>
      ) : rowType === 'relation' ? (
        <>
          <select
            aria-label={`필터 ${i + 1} 조건`}
            value={row.condition}
            onChange={(e) => onUpdate(i, { condition: e.target.value as FilterRowCondition })}
          >
            <option value="contains">포함</option>
            <option value="does_not_contain">미포함</option>
            <option value="is_empty">비어 있음</option>
            <option value="is_not_empty">비어 있지 않음</option>
          </select>{' '}
          {relationNeedsValue &&
            (relationOptions?.loading ? (
              <span>관련 페이지 불러오는 중…</span>
            ) : relationOptions?.error ? (
              <span role="alert" style={{ color: 'crimson' }}>
                {relationOptions.error}
              </span>
            ) : (
              <select
                aria-label={`필터 ${i + 1} 값`}
                value={row.value}
                onChange={(e) => onUpdate(i, { value: e.target.value })}
              >
                <option value="">관련 페이지 선택</option>
                {(relationOptions?.options ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title || '(제목 없음)'}
                  </option>
                ))}
              </select>
            ))}
        </>
      ) : (
        <>
          <select
            aria-label={`필터 ${i + 1} 조건`}
            value={row.condition}
            onChange={(e) => onUpdate(i, { condition: e.target.value as FilterRowCondition })}
          >
            <option value="equals">=</option>
            <option value="does_not_equal">≠</option>
          </select>{' '}
          {optionsOfProp(row.property)?.length ? (
            <select
              aria-label={`필터 ${i + 1} 값`}
              value={row.value}
              onChange={(e) => onUpdate(i, { value: e.target.value })}
            >
              <option value="">값 선택</option>
              {optionsOfProp(row.property)!.map((o) => (
                <option key={o.name} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              aria-label={`필터 ${i + 1} 값`}
              value={row.value}
              placeholder="값 (예: Done)"
              onChange={(e) => onUpdate(i, { value: e.target.value })}
            />
          )}
        </>
      )}{' '}
      <button type="button" onClick={() => onRemove(i)}>
        삭제
      </button>
    </p>
  )
}
