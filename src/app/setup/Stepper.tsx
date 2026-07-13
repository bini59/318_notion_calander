import { cn } from '@/lib/utils'

// 3단계 시각 인디케이터 (DB 선택 → 필드 매핑 → 완료). 상태를 소유하지 않는 순수 컴포넌트 —
// current는 부모의 기존 뷰 분기에서 파생된다(목록=1, properties!==null=2, feedUrl=3).
const STEPS = ['DB 선택', '필드 매핑', '완료'] as const

export default function Stepper({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="mb-8 flex items-center gap-2" aria-label="진행 단계">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3
        const active = step === current
        const done = step < current
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                active && 'border-primary bg-primary text-primary-foreground',
                done && 'border-primary/40 bg-primary/10 text-foreground',
                !active && !done && 'border-border text-muted-foreground',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {step}
            </span>
            <span
              className={cn(
                'text-sm whitespace-nowrap',
                active ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 h-px flex-1 bg-border" aria-hidden />
            )}
          </li>
        )
      })}
    </ol>
  )
}
