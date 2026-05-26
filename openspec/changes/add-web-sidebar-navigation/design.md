## Context

현재 SvelteKit 웹 shell은 `(tabs)` route를 가운데 정렬된 main 영역과 모든 탭 페이지의 `BottomTabBar`로 렌더링한다. API는 이미 `selectProfile`을 지원하지만, 웹 shell에는 지속적으로 노출되는 프로필 전환 UI가 없고 GraphQL schema도 shell에 필요한 계정 범위 프로필 상태를 모두 노출하지 않는다.

## Goals / Non-Goals

**Goals:**

- 고정 데스크톱 사이드바와 모바일 drawer로 동작하는 단일 app-shell 내비게이션 모델을 제공한다.
- 기존 탭 route와 URL을 유지한다.
- 즉시 프로필 전환에는 기존 `selectProfile` mutation을 재사용한다.
- shell이 접근 가능한 프로필 목록을 식별하는 데 필요한 API 조회 필드만 추가하고, 현재 선택 프로필은 PR#46의 `currentSession.selectedProfile`을 사용한다.
- Figma에서 변환한 drawer HTML/CSS를 기준으로 폭, 프로필 히어로, 메뉴 row 간격, active 상태 톤을 맞춘다.

**Non-Goals:**

- 데스크톱 사이드바 collapse 동작.
- 권한 기반 메뉴 필터링.
- 최소 disabled/loading 상태를 넘어서는 복잡한 프로필 전환 로딩/실패 복구.
- 내비게이션이나 세션을 가로지르는 drawer 상태 저장.

## Decisions

- 새 top-level route shell을 도입하지 않고 기존 route group을 유지하며 `(tabs)/+layout.svelte`를 확장한다. 이렇게 하면 route migration 없이 기존 페이지를 유지하면서 데스크톱/모바일 내비게이션 surface를 추가할 수 있다.
- 데스크톱과 drawer surface에서 공유하는 내비게이션 항목 렌더링을 소유하는 사이드바 컴포넌트를 만든다. 전환 기간에는 `BottomTabBar`를 모바일 하단 내비게이션으로 유지할 수 있지만, drawer는 PROD-77에서 요구하는 사이드바 동작을 제공한다.
- 사이드바 폭은 Figma drawer 기준인 `320px`로 맞춘다. 모바일 drawer는 오른쪽 모서리 `16px` radius와 왼쪽에서 열린 surface shadow를 사용하고, 데스크톱 고정 사이드바는 같은 콘텐츠 폭에 border만 적용한다.
- 상단 프로필 영역은 `240px` 높이의 히어로로 구성한다. 현재 API가 banner image, avatar image, follower/following count를 제공하지 않으므로 해당 값은 더미 데이터로 만들지 않고 gradient banner, initial avatar, `0` count placeholder로 표시한다.
- 메뉴 영역은 Figma 기준 `16px` padding, `264px` row 폭, `45px` row 높이, `8px` radius, `12px` icon/text gap을 사용한다. active item은 primary filled CTA가 아니라 옅은 회색 배경과 굵은 글꼴로 현재 위치를 표시한다.
- 왼쪽 edge swipe 제스처는 새 gesture dependency를 추가하지 않고 pointer event로 구현한다. 이 제스처는 작고 shell 내부에 한정되며 새 패키지가 필요하지 않다.
- 웹 앱에 mock 프로필 상태를 하드코딩하지 않고 인증된 GraphQL 필드로 프로필 목록을 노출한다. 현재 선택 프로필은 세션 상태인 `currentSession.selectedProfile`로 읽고, 사이드바는 `selectProfile`이 사용하는 계정/세션 상태를 반영해야 한다.

## Risks / Trade-offs

- 모바일 하단 내비게이션과 drawer 내비게이션이 같은 destination을 중복 제공할 수 있다. 완화: drawer는 사이드바/프로필 동작에 집중시키고, 더 큰 UX migration을 피하기 위해 `BottomTabBar`는 유지한다.
- Figma 원본 MCP 접근은 사용할 수 없고 Figma-to-Code HTML/CSS 산출물을 기준으로 한다. 완화: 수치가 명확한 폭/높이/간격/radius/shadow를 우선 반영하고, 실제 token 연결은 후속 디자인 시스템 정리로 남긴다.
- 프로필 전환은 서버의 세션 상태를 갱신하므로 클라이언트 cache 상태가 늦게 따라올 수 있다. 완화: `selectProfile` 성공 후 shell query를 refresh 또는 재실행한다.

## Migration Plan

- 웹 shell이 실제 프로필 목록을 조회할 수 있도록 GraphQL 조회 필드를 먼저 추가하고, 현재 선택 프로필은 PR#46의 세션 조회 필드를 사용한다.
- 사이드바 컴포넌트를 추가하고 `(tabs)/+layout.svelte`에 연결한다.
- OpenSpec change를 검증하고 웹 type check를 실행한다.

Rollback은 shell 컴포넌트/layout 변경과 추가된 프로필 목록 GraphQL 조회 필드 revert로 제한된다. 데이터베이스 migration은 필요하지 않다.

## Open Questions

- backdrop click, ESC, 브라우저 뒤로가기로 모바일 drawer를 닫을지는 명시 요청이 없는 한 이번 change 범위 밖으로 둔다.
- Figma HTML에 포함된 follower/following count, banner image, avatar image를 실제 데이터로 연결하려면 API 필드 확장이 별도 change로 필요하다.
