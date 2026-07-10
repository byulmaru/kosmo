## Why

PROD-112~114의 legacy Svelte 셸은 Tailwind `lg` 단일 브레이크포인트로 반응형 처리해, 1024px 한 지점에서 "전체 폭 모바일"과 "꽉 찬 3분할"이 한 번에 전환됐다. 그 결과 1024~1280px 구간에서 3컬럼이 비좁게 눌렸다. 이 change가 확정한 트위터/X식 다단계 layout 계약은 Expo/React Native Web 셸에도 그대로 적용한다. (Linear PROD-118)

## What Changes

- `(tabs)` 셸을 3단계 압축형으로 둔다: 모바일(`<768`) → 아이콘 레일 + 피드(`768~1279`) → 풀 사이드바 3분할(`≥1280`).
- 풀 3분할 등장 폭을 `xl`(1280)로 둬, 1024~1280 구간에서는 컬럼을 비좁게 누르는 대신 아이콘 레일 단계로 폭을 확보하고 중앙 피드가 `600px`를 유지하게 한다.
- 좌측 사이드바에 `xl` 미만 아이콘 전용 레일 / `xl` 이상 풀 사이드바 분기를 둔다(한 컴포넌트에서 CSS 반응형으로 전환).
- 모바일 ↔ 데스크톱 셸 경계를 `lg`에서 `md`로 내린다(헤더·drawer·하단 탭 바·swipe·`openProfileSwitcher` 기준).
- 글쓰기 진입은 우측 레일이 없는 `md`~`xl` 아이콘 레일 단계에서만 사이드바 글쓰기 버튼으로 제공하고, `xl` 이상에서는 우측 레일 컴포저가 담당하므로 사이드바 글쓰기 버튼을 표시하지 않는다.
- 중앙 피드 최대 폭은 `600px`를 유지한다(확장하지 않음).
- 브레이크포인트 단계·컨벤션을 `docs/design/breakpoints.md`로 정리한다.
- breakpoint는 `apps/app/src/theme/tokens.ts`의 `compact=768`, `full=1280`을 재사용하고 component-local 숫자를 추가하지 않는다.

## Dependencies

- 본 변경은 `add-main-three-column-shell`(PROD-112)의 3컬럼 셸 위에서 동작하며, 그 변경의 `lg` 단일 경계 동작을 압축형 다단계로 확장·대체한다. PROD-112 셸 요구사항(`Desktop three-column shell layout`)이 canonical 스펙에 아카이브되어, 본 변경은 그 요구사항을 압축형 단계 동작으로 수정(MODIFIED)하고, 아이콘 레일 사이드바·사이드바 글쓰기 진입·접힌 프로필 스위처를 새 요구사항(ADDED)으로 추가한다.

## Capabilities

### Modified Capabilities

- `web-app-shell`: `lg` 단일 브레이크포인트 대신 `md`/`xl` 압축형 단계 동작으로 `Desktop three-column shell layout`을 수정하고, 아이콘 레일 사이드바·사이드바 글쓰기 진입·접힌 프로필 스위처 요구사항을 추가한다.

## Impact

- `apps/app/src/theme/tokens.ts` — `compact`/`full` breakpoint token
- `apps/app/src/components/shell/UniversalShell.tsx` — 모바일/아이콘+피드/풀 3분할 shell branch
- `apps/app/src/components/shell/SidebarNavigation.tsx` — 아이콘 레일/풀 분기, 글쓰기 버튼
- `apps/app/src/components/shell/BottomTabBar.tsx` — 모바일 전용 하단 탭과 safe-area
- `docs/design/breakpoints.md`(신규), `docs/design/README.md`, `docs/design/figma.md`
- API·데이터 모델 영향 없음

## Out of Scope

- 기존 shell의 raw color → 디자인 토큰 마이그레이션
- 아이콘 레일 hover tooltip, Figma 모바일/아이콘 단계 프레임 추가
