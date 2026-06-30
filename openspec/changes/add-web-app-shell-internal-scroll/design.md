## Context

현재 `(tabs)` shell은 최상위 grid와 중앙 영역이 `min-h-screen` 기반으로 구성되어 document/window scroll에 자연스럽게 의존한다. 모바일 하단 탭은 fixed로 viewport 하단에 붙고, 우측 rail은 `RightRail.svelte` 내부가 아니라 `(tabs)/+layout.svelte`의 부모 wrapper `sticky top-0`에 기대어 배치된다.

이 구조는 짧은 화면에서는 단순하지만, 데스크톱에서 중앙 피드를 스크롤할 때 좌측/우측 shell chrome의 움직임과 scroll ownership이 명확하지 않다. 이번 변경은 기존 `md`/`xl` 3단계 반응형 shell 모델을 유지하면서, shell chrome은 viewport에 남고 중앙 콘텐츠만 내부 scroll container가 되는 구조로 정리한다.

구현 전에는 최신 `main` 기준으로 `BottomTabBar`, `(tabs)/+layout`, `ProfileConnectionList`, `web-app-shell` OpenSpec 상태를 다시 확인한다. 이 스펙 변경은 2026-07-01 기준 범위 산정에서 출발하지만, 스택 구현 PR은 최신 main의 PROD-221/PROD-188 반영 상태를 기준으로 작성되어야 한다.

## Goals / Non-Goals

**Goals:**

- `(tabs)` shell을 viewport 높이 기준 app shell로 구성한다.
- 중앙 라우트 콘텐츠 영역이 단일 세로 internal scroll container를 소유하게 한다.
- 모바일 header, 하단 탭, 데스크톱 sidebar/icon rail, 우측 rail이 중앙 콘텐츠 스크롤과 함께 움직이지 않게 한다.
- 기존 `md`/`xl` 반응형 단계와 각 단계의 navigation/compose 진입점을 유지한다.
- 우측 rail의 document sticky 의존을 제거하고 shell grid column 안에서 배치한다.
- 검색 `noScroll`, 게시글 상세 sticky header, route 전환 시 내부 scroller 위치를 확인 가능한 계약으로 만든다.
- 구현 변경에 필요한 최소 viewport smoke 검증만 이 변경에 포함한다.

**Non-Goals:**

- feed pagination/infinite scroll 구현.
- 팔로워/팔로잉 pagination 구현 또는 재작업.
- 하단 탭 IA 변경. 이는 PROD-221 범위다.
- 반응형 앱 내비게이션 E2E suite 전체 구현. 이는 PROD-233 범위다.
- 네이티브 WebView pull-to-refresh 또는 플랫폼별 overscroll 정책 확정.
- 미래 multi-column/timeline workspace 레이아웃 설계.

## Approach

`(tabs)/+layout.svelte`가 shell height와 scroll ownership의 중심이 된다. 최상위 shell은 viewport height(`100dvh` 계열)와 `min-h-0`을 사용해 grid 자식이 내부 overflow를 가질 수 있게 만들고, 중앙 column은 route 콘텐츠 wrapper 안에서 `overflow-y-auto`를 소유한다.

모바일 단계에서는 header와 bottom tab을 shell chrome으로 취급한다. 중앙 content row가 남은 viewport height 안에서 스크롤하고, 하단 탭 safe-area padding은 유지한다. 기존 `main pb-24`류의 fixed bar 회피 padding은 shell 구조에 맞춰 최소화하거나 명확한 scroll padding으로 바꾼다.

`md` 이상 단계에서는 좌측 sidebar/icon rail이 shell column 안에서 viewport 높이를 차지한다. `xl` 이상 우측 column은 부모 `sticky top-0` 없이 shell grid의 높이 안에 배치한다. 우측 rail 내용이 길어지는 경우 우측 column 또는 rail 내부가 자체 overflow를 처리하되, 중앙 content scroll과 연결하지 않는다.

라우트별 wrapper는 중앙 scroll container 안에서 기존 폭과 정렬을 유지한다. 프로필/게시글 상세의 음수 margin 기반 padding 상쇄는 구현 중 유지 가능성을 먼저 확인하고, 필요할 때만 route content boundary를 정리한다.

## Risks / Trade-offs

- [Risk] `overflow-y-auto`를 중앙 container로 옮기면 SvelteKit의 기본 document scroll restoration과 어긋날 수 있다. → 일반 route 이동은 상단 이동, 검색 `noScroll` 유지, back/forward 기대 동작을 smoke로 확인한다. 공통 restoration helper가 필요해지면 별도 이슈로 분리한다.
- [Risk] 모바일 safe-area와 fixed bottom tab padding을 동시에 유지하면 하단 여백이 중복될 수 있다. → bottom tab을 shell chrome으로 취급하고, content padding은 실제 겹침 방지에 필요한 값만 둔다.
- [Risk] 프로필/게시글 상세가 공유 `main` padding에 음수 margin으로 결합되어 있어 internal scroll 전환 때 폭/상단 정렬이 깨질 수 있다. → 우선 현재 wrapper를 보존해 검증하고, 리팩터링이 커지면 별도 이슈로 분리한다.
- [Risk] PROD-233의 E2E 범위를 이 PR에 끌어오면 스펙/구현 범위가 커진다. → 이 변경은 최소 viewport smoke만 포함하고, E2E suite는 PROD-233이 변경된 shell 기준으로 보강한다.
- [Risk] 우측 rail이 현재 composer만 담고 있어 독립 overflow가 과해 보일 수 있다. → shell column 배치와 sticky 제거를 먼저 계약화하고, 긴 rail content는 미래 확장 시 같은 overflow 경계 안에서 처리한다.

## Migration Plan

1. OpenSpec change와 디자인 문서를 먼저 PR로 올려 scroll ownership 계약을 리뷰한다.
2. 스펙 PR 위에 구현 PR을 쌓고, 최신 `main`의 shell 관련 변경을 다시 확인한 뒤 구현한다.
3. 구현 PR에서는 shell layout, bottom tab padding, sidebar/drawer height, right rail placement, route scroll behavior를 한 번에 검증한다.
4. 구현 완료 후 PROD-220이 함께 해소됐는지 판단하고, PROD-233은 변경된 shell 기준으로 E2E를 보강한다.

Rollback은 구현 PR을 되돌리면 기존 document scroll 기반 shell로 돌아가는 구조를 목표로 한다. 스펙 PR은 구현 PR과 분리되어 있으므로, 구현 중 범위가 과해지면 스펙을 먼저 조정한 뒤 구현을 다시 쌓는다.

## Open Questions

- back/forward 위치 복원을 내부 scroll container 기준으로 얼마나 엄격하게 지원할지 구현 중 확인이 필요하다.
- iOS Safari/WebView의 safe-area/overscroll 대응이 웹 shell 기본 구현만으로 충분한지 구현 검증 후 판단한다.
- 프로필/게시글 상세 wrapper 정리가 단순 호환 보정인지, 별도 layout 리팩터링인지 구현 중 판단한다.
