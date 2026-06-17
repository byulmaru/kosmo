## Why

PROD-112~114에서 메인 3분할 셸을 Tailwind `lg` 단일 브레이크포인트로 반응형 처리해, 1024px 한 지점에서 "전체 폭 모바일"과 "꽉 찬 3분할"이 한 번에 전환된다. 그 결과 1024~1280px 구간에서 3컬럼이 비좁게 눌린다. 트위터/X처럼 폭에 따라 단계적으로 컬럼이 줄어드는 다단계 브레이크포인트가 필요하다. (Linear PROD-118)

## What Changes

- `(tabs)` 셸을 `lg` 단일 경계에서 `md`/`lg`/`xl` 4단계로 바꾼다: 모바일(`<md`) → 아이콘 레일 + 피드(`md`~`lg`) → 아이콘 레일 + 피드 + 우측 레일(`lg`~`xl`) → 풀 사이드바 3분할(`≥xl`).
- 좌측 사이드바에 `xl` 미만 아이콘 전용 레일 / `xl` 이상 풀 사이드바 분기를 추가한다(한 컴포넌트에서 CSS 반응형으로 전환).
- 모바일 ↔ 데스크톱 셸 경계를 `lg`에서 `md`로 내린다(헤더·drawer·하단 탭 바·swipe·`openProfileSwitcher` 기준).
- 아이콘 레일 단계에서는 우측 컴포저와 하단 탭이 모두 없어 글쓰기 진입점이 사라지므로, 사이드바(아이콘/풀 공통)에 `/compose` 글쓰기 버튼을 추가한다.
- 브레이크포인트 단계·컨벤션을 `docs/design/breakpoints.md`로 정리한다.
- 커스텀 `--breakpoint-*` 토큰은 추가하지 않고 Tailwind 기본값을 재사용한다.

## Dependencies

- 본 변경은 `add-main-three-column-shell`(PROD-112)의 3컬럼 셸 위에서 동작하며, 그 변경의 `lg` 단일 경계 동작을 다단계로 확장·대체한다. PROD-112 셸 요구사항(`Desktop three-column shell layout`)이 아직 아카이브되지 않아, 본 변경은 충돌을 피하려 기존 요구사항을 수정(MODIFIED)하지 않고 다단계 동작을 새 요구사항(ADDED)으로 추가한다.

## Capabilities

### Modified Capabilities

- `web-app-shell`: `lg` 단일 브레이크포인트 대신 `md`/`lg`/`xl` 4단계 반응형 동작, 아이콘 레일 사이드바, 사이드바 글쓰기 진입 요구사항이 추가된다.

## Impact

- `apps/web/src/routes/(tabs)/+layout.svelte` — 그리드 4단계화, 모바일 셸 토글 `lg`→`md`
- `apps/web/src/lib/components/SidebarNavigation.svelte` — 아이콘 레일/풀 분기, 글쓰기 버튼
- `apps/web/src/lib/components/BottomTabBar.svelte` — `lg:hidden`→`md:hidden`
- `docs/design/breakpoints.md`(신규), `docs/design/README.md`, `docs/design/figma.md`
- API·데이터 모델 영향 없음

## Out of Scope

- `SidebarNavigation` 기존 풀 분기의 raw hex → 디자인 토큰 마이그레이션
- 아이콘 레일 hover tooltip, Figma 모바일/아이콘 단계 프레임 추가
