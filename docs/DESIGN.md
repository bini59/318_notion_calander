# 디자인 시스템 (Notion → iCal 브릿지)

Tailwind v4 (CSS-first) + shadcn/ui (Radix 프리미티브, Neutral 베이스). 미니멀 모노크롬, 다크 우선.
비주얼 레이어 전용 — API 계약·상태 로직·전송 payload는 불변.

## 토큰 (`src/app/globals.css`)

shadcn `init`가 주입한 oklch 토큰을 사용한다. 색상은 `@theme inline`에서 `--color-*` → CSS 변수로 매핑되며,
Tailwind 유틸(`bg-background`, `text-muted-foreground` 등)로 참조한다.

- **팔레트**: 순수 무채색(oklch chroma 0) 그레이스케일. 크로마틱 색은 `destructive`(경고/에러)만.
- **액센트**: 별도 유채색 액센트 없음 — `primary`(라이트=거의 검정, 다크=거의 흰색)가 유일한 강조.
  "필수" 배지 = `Badge`(default, primary), "선택" 배지 = `Badge variant="secondary"`(회색).
- **타이포**: Inter (`next/font/google`, `--font-sans`). 본문 `text-sm`, 제목 `text-xl font-semibold`.
- **스페이싱**: 8px 그리드 = Tailwind spacing 관행(4의 배수 유틸, 주로 `gap-2/3/4`, `p-3/4/6`, `py-10`).
- **반경**: `--radius: 0.625rem` 기준 `rounded-md/lg`.

## 다크 우선

`prefers-color-scheme: dark`에서 `.dark` 토큰 값을 `:root`에 직접 매핑(시스템 추종, JS/토글 없음).
`.dark` 클래스 전략도 그대로 남아 있어 수동 토글이 필요해지면 승격 가능.
WCAG AA: foreground/background, muted-foreground, primary 위 텍스트 모두 대비 ≥ 4.5:1(본문)/3:1(UI).

## 레이아웃

- 중앙 컨테이너: `mx-auto w-full max-w-[640px] px-6`.
- `/setup`: 상단 `Stepper`(3단계) + 뷰 본문 + sticky 푸터 바(`sticky bottom-0`).
- 모바일: 2컬럼 매핑 행/필터 행은 `flex-wrap`/`grid-cols-1 sm:grid-cols-[...]`로 스택.

## 컴포넌트 규칙 (어떤 프리미티브를 어디에)

- **Button**: filled dark(`default`) = 주요 액션("캘린더 만들기", "Notion 연결"), `ghost` = 부차("뒤로", "삭제"),
  `outline` = 중립("URL 재발급", "+ 필터 추가"), `asChild`로 `<a>` 래핑.
- **Select** (Radix): 모든 드롭다운. ⚠️ 빈 문자열 value 금지 → "없음"은 센티넬 `__none__`을 쓰고
  state는 `''`(NONE) 유지(payload 조립 불변). placeholder는 `SelectValue`가 담당(빈 옵션 렌더 안 함).
- **ToggleGroup** (`type="single"`, `variant="outline"`): 설명 소스 세그먼티드 토글(속성에서 | 페이지 본문에서).
  단일 선택 해제로 빈 값이 오면 무시(`v && setState`).
- **Badge**: default = 필수(강조), secondary = 선택(회색).
- **Input**: 구독 URL(readOnly, `font-mono`), 필터 자유텍스트 값.
- **Separator**: 필수/선택 그룹, 필터 섹션 구분.
- **Label**: 매핑 행의 iCal 필드 라벨.

## 화면 스펙

### /setup — 스테퍼
`Stepper current={1|2|3}`. 상태 없음 — 뷰 분기에서 파생(목록=1, `properties!==null`=2, `feedUrl`=3).

### /setup — 필드 매핑
`MappingField`: `[iCal 라벨] ← [Notion 속성 컨트롤]` 2컬럼(모바일 스택), 커넥터 `←`.
- 필수 그룹: 제목(읽기전용 + 필수 배지), 시작일(date Select + 필수 배지, date 1개면 disabled).
- Separator.
- 선택 그룹: 종료일(date Select, 기본 "없음"), 설명(ToggleGroup → "속성에서"면 속성 Select를
  `animate-in fade-in slide-in-from-top-1`로 reveal / "본문"이면 안내 문구), 장소(속성 Select).

### /setup — 필터
`FilterSection`: 헤더 "필터" + 헬퍼 + 빈 상태 카드 + 행(사이 "AND") + "+ 필터 추가".
`FilterRow`(per-row): `[속성][조건][값][✕]`, 타입별 브랜치(checkbox/relation/select·status) 불변.

### / — 랜딩
중앙 히어로: 타이틀 + 설명 + "Notion 연결" Button(link). `?notion=denied` 경고(`role="alert"`).

## shadcn 컨벤션

- `components.json`: style `radix-nova`, baseColor `neutral`, alias `@/components`·`@/lib/utils`.
- 프리미티브는 `src/components/ui/*`, 수정하지 않고 사용. 추가는 `npx shadcn@latest add <name>`.
- 클래스 병합은 `cn()`(`@/lib/utils`).
