## Context

`sync-selected-profile-after-switch`의 proposal, post/web-app-shell delta specs, design에 기록된 프로필 전환 후 selected profile 동기화 결정을 ADR 형식으로 정리한다.

## Decision Records

### 프로필 전환 성공 응답을 즉시 UI 갱신 입력으로 사용한다

- Status: Accepted
- Context / Problem: 프로필 전환 mutation은 성공 응답으로 갱신된 `Session.selectedProfile`을 제공하지만, 이미 열린 웹 셸과 `/compose` 화면이 이 값을 즉시 반영해야 한다는 클라이언트 계약이 명확하지 않았다.
- Decision Outcome: 일반 프로필 선택 성공 후 `selectProfile.session.selectedProfile`을 앱 셸이 받은 최신 active profile로 취급한다.
- Alternatives Considered: route query의 `currentSession.selectedProfile` 재조회가 끝날 때까지 기다릴 수 있지만 작성자 표시와 사이드바 프로필이 어긋나는 시간이 생긴다.
- Consequences: mutation 응답에서 composer/sidebar에 필요한 `Profile` fragment 데이터를 함께 선택해야 한다.
- Confirmation / Follow-up: 프로필 생성 후와 기존 프로필 선택 후 composer/sidebar 표시가 즉시 갱신되는 E2E로 확인한다.

### 일반 선택 성공 handler는 currentSession 전체 수동 refetch에 의존하지 않는다

- Status: Accepted
- Context / Problem: `currentSession` 전체 invalidation/refetch를 UI 갱신 전제로 삼으면 프로필 전환 직후 표시가 늦고 갱신 범위가 불필요하게 넓어진다.
- Decision Outcome: 일반 선택에서는 mutation 응답으로 shell/composer 표시를 갱신하고, `homeTimeline`, `Profile.viewerFollow`처럼 active profile에 따라 결과가 달라지는 field만 필요한 범위로 stale 처리한다.
- Alternatives Considered: `currentSession` 전체를 항상 stale 처리하거나 refetch할 수 있지만 선택 성공 응답의 서버 확인 값을 활용하지 못한다.
- Consequences: profile-created 흐름과 일반 선택 흐름을 구분하는 reason 값이 필요하다.
- Confirmation / Follow-up: 일반 선택 성공 handler가 `currentSession` 전체 수동 invalidation/refetch를 직접 요구하지 않는지 E2E 또는 실행 추적으로 확인한다.

### 새 프로필 생성 후 선택은 프로필 목록 갱신을 허용한다

- Status: Accepted
- Context / Problem: 새 프로필 생성 직후에는 selected profile 표시뿐 아니라 접근 가능한 프로필 목록 자체가 바뀐다.
- Decision Outcome: `profile-created` 성격의 성공 처리에서는 `me` 또는 동등한 프로필 목록 데이터를 갱신할 수 있다.
- Alternatives Considered: 일반 선택과 동일하게 목록 갱신을 막을 수 있지만 새 프로필이 switcher 목록에 나타나지 않을 수 있다.
- Consequences: 선택 성공 callback은 기존 프로필 선택과 새 프로필 생성 후 선택을 구분해야 한다.
- Confirmation / Follow-up: 새 프로필 생성 후 switcher/sidebar/composer가 새 프로필을 표시하는지 확인한다.

### 이미 열린 compose route에서는 최신 선택 응답을 route query보다 우선한다

- Status: Accepted
- Context / Problem: `/compose` route query의 `currentSession.selectedProfile`이 이전 값을 가리키는 동안에도 앱 셸은 최신 선택 성공 응답을 알고 있을 수 있다.
- Decision Outcome: 앱 셸이 보유한 최신 선택 성공 응답이 있으면 `/compose`의 작성 프로필 입력으로 route query 값보다 우선 반영한다.
- Alternatives Considered: route query만 사용할 수 있지만 이미 열린 compose 화면의 작성자 표시가 전환 직후 늦게 바뀐다.
- Consequences: `/compose` route로 최신 selected profile을 전달하는 좁은 경로가 필요하다.
- Confirmation / Follow-up: 이미 열린 `/compose`에서 다른 프로필을 선택했을 때 composer와 sidebar가 즉시 새 프로필을 표시하는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
