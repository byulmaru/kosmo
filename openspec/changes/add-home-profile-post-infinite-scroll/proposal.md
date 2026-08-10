## Why

Home과 Profile 게시글 목록은 서버가 cursor pagination을 제공하는데도 첫 20개만 소비해 이전 게시글을 탐색할 수 없다. 완료된 PROD-662의 공통 Web·Native 자동 pagination lifecycle을 재사용해 두 목록에 같은 무한 스크롤 경험을 제공한다.

## What Changes

- Home과 Profile이 서로 분리된 Relay pagination owner와 connection key로 게시글을 20개씩 누적한다.
- Web·Native에서 목록 하단 near-end 도달 시 공통 자동 pagination lifecycle로 다음 page를 한 번 요청하고, 짧은 page 성공 뒤 viewport를 다시 측정한다.
- 다음 page 로딩 중 기존 목록 아래에 spinner를 표시하고, 마지막 page에서는 추가 요청을 중단한다.
- 다음 page 실패 시 기존 목록을 유지하고 하단 toast의 `다시 시도` action으로만 수동 재시도한다.
- Profile handle·actor revision 또는 Home actor가 바뀌면 이전 pagination loading·error·page 상태를 재사용하지 않는다.
- Home의 기존 `PostList_homeTimeline` connection identity를 유지해 새 Post prepend와 다음 page append가 중복이나 순서 역전 없이 함께 동작하게 한다.
- 공개·추천·Local Timeline, GraphQL schema, Subscription transport, Home 재선택 refresh 동작은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-646`
- Linear Implementations: `PROD-646`; 완료된 선행 공통화 `PROD-662`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Home과 Profile 게시글 목록의 기존 첫-page 표시 계약을 공용 Expo 클라이언트의 Web·Native cursor 무한 스크롤, 다음-page 상태, identity 격리와 Home prepend 정합성 계약으로 확장한다.

## Impact

- `apps/app`의 Home/Profile route, Post 목록 Relay fragment, 부모 scroll owner와 pagination feedback가 영향을 받는다.
- Relay compiler가 Home/Profile pagination query artifact를 생성한다.
- 기존 `useAutomaticPagination`, `ToastProvider`, theme token과 Home connection key를 재사용한다.
- GraphQL schema·resolver, 데이터베이스·migration, 새 dependency와 ActivityPub 동작에는 영향이 없다.
