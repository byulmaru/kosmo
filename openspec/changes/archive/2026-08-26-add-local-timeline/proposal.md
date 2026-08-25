## Why

로그인한 사용자는 현재 선택한 Profile로 같은 Local Instance의 공개 게시물을 한곳에서 탐색할 수 없다. PROD-649는
기존 Post 정책과 목록 컴포넌트를 재사용해 `/local`에 예측 가능한 Local Post List를 제공한다.

## What Changes

- configured Local Instance의 Active/Normal Local Profile이 작성한 Public Content Post와 Quote를 최신순
  `localTimeline` Relay connection으로 제공한다.
- Reply, Content 없는 Repost, 원격 작성자, Public이 아닌 Post를 page limit 전에 제외한다.
- 현재 runtime의 Post Visibility·Eligibility·Sensitive Media·Media 조회 정책을 적용한다.
- Profile Block과 Profile Mute의 Local 결정은 `Exclude`로 canonical 계약에 기록하되, 아직 없는 runtime 연결은
  PROD-813/814의 기능 도입·회귀 검증 책임으로 유지한다.
- `/home`과 `/local`에 공통 `홈`/`로컬` 상단 탭을 제공하고 `/local`의 로딩·빈 목록·오류·재시도·refresh·다음
  page 상태를 제공한다.
- 기존 `PostListItem`, Profile/Post detail route, Relay actor/store 격리와 공통 pagination lifecycle을 재사용한다.
- Federated·추천 timeline, guest 접근, subscription/push와 기존 Home/Profile/Hashtag 후보 정책은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/policies/post-list.md`, `docs/design/local-timeline.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-649`
- Linear Implementations: `PROD-649`; Block/Mute 후속 연결 `PROD-813`, `PROD-814`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `post`: 선택된 Profile 기준 Local Post List를 `localTimeline` Relay connection으로 제공한다.
- `web-app-shell`: `/home`과 `/local`의 공통 탭, Local route와 목록 상태·pagination·refresh를 제공한다.

## Impact

- `apps/api`의 Post GraphQL query와 통합 검증, generated GraphQL schema가 영향을 받는다.
- `apps/app`의 Home route, 새 Local route, Post 목록 Relay fragment와 공통 timeline tab이 영향을 받는다.
- `apps/web`의 실제 route E2E fixture와 timeline 검증이 영향을 받는다.
- 데이터베이스 schema·migration, 새 dependency, ActivityPub delivery와 기존 Post List 후보 정책에는 영향이 없다.
