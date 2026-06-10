# Design: add-profile-post-list-states

## Context

프로필 페이지 `(tabs)/@[handle]/+page.svelte`는 현재 placeholder 문구 한 줄이다. 상위 `+layout.svelte`가 `profileByHandle` query로 프로필 로딩·오류·없음 상태를 처리하고 `ProfileHero`를 렌더한 뒤 `{@render children()}`으로 페이지를 표시한다. 게시글 목록 query(PROD-120)는 미머지 상태이고, 게시글 디테일(PROD-89)에서 로딩 스켈레톤·인라인 빈 상태·더미 분기 골격 패턴이 확립되어 있다. 필요한 컴포넌트(`TextSkeleton`, `Avatar` 등)는 모두 main에 머지되어 있다.

## Goals / Non-Goals

**Goals:**

- 프로필 페이지에 게시글 목록 영역 골격을 추가하고, 로딩 스켈레톤과 게시글 없음 빈 상태를 실데이터 없이 표시한다.
- PROD-124(실데이터 연결)가 더미 상수→`createQuery` 교체만으로 끝나도록 분기 골격을 미래 query 모양에 1:1 매핑한다.
- Storybook에서 로딩·빈 상태를 확인할 수 있게 한다.

**Non-Goals:**

- 게시글 목록 아이템 렌더링과 실데이터 연결(PROD-124).
- 게시글 디테일로의 이동 링크(PROD-111).
- 목록 조회 오류 상태(query가 생기는 PROD-124에서 함께 처리).
- 페이지네이션·무한 스크롤.

## Decisions

- **상태 UI를 `ProfilePostList` 컴포넌트로 분리한다.** 페이지 인라인 마크업 대안과 비교해, Storybook에서 상태별 화면을 확인해야 하는 완료 기준을 충족하려면 컴포넌트가 필요하다. PROD-124에서 목록 아이템 렌더링·fragment가 이 컴포넌트에 추가될 자리이기도 하다.
- **컴포넌트는 fragment 없는 프레젠테이션 컴포넌트로 시작한다.** 아직 소비할 데이터가 없으므로 `loading?: boolean` prop만 받는다. 데이터가 생기기 전에 가짜 fragment를 선언하면 Storybook에서만 통과하고 실제 Mearie runtime과 어긋날 수 있다(memory/frontend-svelte.md). fragment 도입은 PROD-124에서 실제 query와 함께 진행한다.
- **페이지에는 더미 분기 골격을 두고 기본값은 loading으로 한다.** 게시글 디테일(PROD-89)의 더미 패턴을 따라, 미래 query 결과와 같은 모양의 더미 상수 한 곳에서 분기를 공급한다. 완료 기준("목록 영역 자리와 로딩 스켈레톤이 표시된다")과 일치하고, PROD-124에서 query.loading/빈 목록으로 자연스럽게 교체된다. 빈 상태 분기는 페이지에서 당장 도달 불가지만 PROD-124 선제 구현으로 주석을 남긴다.
- **스켈레톤·빈 상태 마크업은 기존 패턴을 복제한다.** 스켈레톤은 게시글 디테일 로딩(좌측 `w-10` 아바타 거터 + `TextSkeleton` 줄)을 아이템 3개로 반복하고, 빈 상태는 확립된 인라인 패턴(`px-4 py-12 text-center`, 제목+보조 설명)을 따른다. Figma에 Empty feed 디자인이 없으므로 새 디자인을 발명하지 않고 코드 컨벤션을 따른다. 신규 디자인 토큰은 불필요하다.

## Risks / Trade-offs

- [페이지 기본 상태가 영구 로딩 스켈레톤이라 실데이터 연결 전까지 사용자에게 "계속 로딩 중"으로 보인다] → 의도된 중간 상태다. PROD-124가 이 체인지에 blocked로 연결되어 있고, 더미 상수에 TODO(PROD-124) 주석으로 교체 지점을 명시한다.
- [스켈레톤 마크업이 게시글 디테일 로딩과 중복된다] → 현 시점 두 곳뿐이라 공통화 비용이 더 크다. 목록 아이템 실렌더링(PROD-124) 때 실제 아이템 구조가 확정되면 공통화를 재검토한다.
- [빈 상태 문구·레이아웃이 추후 Figma Empty feed 디자인과 달라질 수 있다] → 토큰 기반 마크업이라 디자인 확정 시 교체 비용이 작다.
