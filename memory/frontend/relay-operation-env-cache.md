# Frontend: Relay Operation, Environment And Cache

Read this entire file when changing Relay documents, actor environments, mutations, normalized state, or connection updates. When writing or modifying React components that use Relay, also use [`relay-best-practices`](../../.codex/skills/relay-best-practices/SKILL.md). Select [`relay-performance`](../../.codex/skills/relay-performance/SKILL.md) for data-fetching, rendering, or cache performance optimization.

## Relay Colocation

- GraphQL query, mutation, fragment document는 실제로 사용하는 `.tsx` 파일에 `graphql` tag로 둔다.
- route는 `useLazyLoadQuery`로 화면 query를 소유하고, GraphQL entity를 소비하는 자식은 자신의 fragment를 선언해 generated `{FragmentName}$key`를 prop으로 받는다.
- 부모는 자식 fragment를 spread하고 fragment ref를 그대로 넘긴다. `id`, `handle`, `displayName` 같은 field subset을 수동 scalar prop으로 복제하지 않는다.
- 한 컴포넌트가 여러 부모 query에서 재사용되더라도 document를 공용 query helper로 빼지 않는다. 재사용 경계는 query가 아니라 fragment다.
- operation name은 화면/컴포넌트 책임을 드러내는 기존 이름을 유지한다. Relay network request body는 `operationName`, persisted text가 아닌 `request.params.text`, `variables`를 포함해 API와 E2E interception 계약을 지킨다.
- generated `__generated__` artifact는 commit하지 않는다. schema 또는 document가 바뀌면 `pnpm --filter @kosmo/app relay`를 실행하고 `check`/build에서도 compiler를 선행한다.
- `DateTime` 같은 custom scalar는 `apps/app/relay.config.json`에서 native-safe TypeScript type으로 매핑한다. DOM 기반 editor type을 scalar boundary에 넣지 않는다.

## Relay Environment And Mutations

- web request는 same-origin BFF `/graphql`과 HttpOnly cookie를 사용한다. Native request는 channel-configured API `/graphql`에 SecureStore에서 복원한 session token을 Bearer로 보내고 `credentials: 'omit'`을 사용한다. Native AuthSession은 Web과 공유하는 confidential OIDC application의 client ID로 authorization code, PKCE verifier와 exact `kosmo://login/callback` redirect URI만 반환하고, 로그인 화면에 colocate한 Relay `exchangeNativeOidcSession` mutation이 token 없는 native Environment를 통해 같은 API `/graphql`에서 session을 교환한다. API는 server-held client secret으로 code를 교환하며 secret은 Native bundle/request에 포함하지 않는다. BFF REST route, ad hoc GraphQL `fetch`, raw ID/access token 교환을 사용하지 않는다. Native SecureStore 값은 validated API origin, shared OIDC issuer, shared client ID와 token을 함께 저장하며 하나라도 현재 설정과 다르면 삭제해 채널 또는 OIDC application 전환 뒤 이전 bearer를 보내지 않는다. UI code가 web cookie를 직접 읽거나 native token을 URL에 넣지 않는다.
- `Session.selectedProfile.id`가 바뀌면 Relay Environment와 Store를 새로 만든 뒤 현재 route query를 새 actor 기준으로 실행한다. `homeTimeline`과 canonical viewer-relative 상태인 `Profile.viewerState`를 수동 필드 목록으로 invalidate하지 않는다.
- mutation 응답은 영향받는 Node의 `id`와 변경된 필드를 선택해 Relay normalized store가 갱신되게 한다. connection membership 변경이 필요할 때만 Relay connection directive 또는 좁은 updater를 사용한다.
- Relay fetch·refetch·pending·disposal은 표준 hook·fragment·normalized store·directive를 먼저 사용한다. 수동 `fetchQuery.subscribe`와 state 수명주기를 wrapper로 옮기는 것만으로 해결됐다고 보지 않으며, membership 변경 등 계약에 필요한 좁은 updater는 허용한다. actor 변경·요청 실패·접근성 계약은 이 경계에서 계속 보존한다.
- 새 게시글의 현재 actor Home 목록은 producer별로 별도 갱신한다. 현재 actor가 호출한 `createPost` 성공 결과의 normalized `post`만 요청 actor Store의 이미 로드된 Home managed connection에 Relay `@prependNode` directive로 최신순·중복 없이 반영하고, Post List 후보·정책 필드·cursor를 클라이언트에서 합성하거나 광범위하게 refetch하지 않는다. 로드되지 않은 Home connection은 Relay가 만들지 않는다. 다른 producer의 membership 전달은 이 흐름의 계약이 아니다. actor Environment가 전환된 뒤 늦게 완료된 이전 요청은 이전 Store에만 적용하고 새 actor UI를 변경하지 않는다.
- profile 선택 mutation은 payload UI 갱신과 actor environment reset을 모두 수행한다. 이전 actor Store를 새 profile에 재사용하지 않는다.
- Route와 독립 surface의 GraphQL/network 오류는 가장 가까운 error boundary가 소유하고, 해당 query만 새 `fetchKey` 또는 query reference로 재시도한다. 루트까지 전파된 오류는 특정 query를 추측해 재시도하지 않고 Relay·Session provider runtime 전체를 다시 생성한다. backend `message` 원문 노출 정책이 확정되지 않은 흐름에서는 컴포넌트마다 ad hoc 분기를 만들지 않는다.

## Relay Connections

- followers/following처럼 다음 페이지가 필요한 fragment는 `@argumentDefinitions`, `@refetchable`, `@connection`을 선언하고 `usePaginationFragment`로 읽는다.
- route state에서 edge를 수동 concat하거나 cursor 중복 제거 helper를 만들지 않는다. Relay connection identity와 `loadNext`가 누적을 소유한다.
- 다음 페이지 로딩 중에는 중복 요청을 막고, 실패해도 기존 edge를 유지하며 같은 위치에서 재시도할 수 있게 한다. `hasNext`가 false면 load-more action을 숨긴다.
- connection key는 component와 관계가 드러나는 안정적인 이름을 사용한다. filter argument가 생기면 `filters`를 명시해 서로 다른 목록이 같은 connection으로 합쳐지지 않게 한다.
