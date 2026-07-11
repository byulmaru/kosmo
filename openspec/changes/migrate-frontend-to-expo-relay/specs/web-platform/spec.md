## ADDED Requirements

### Requirement: Expo web asset serving

웹 workload는 Expo가 export한 Web SPA asset과 기존 server endpoint를 같은 public origin에서 제공해야 한다(MUST).

#### Scenario: Serve an exported route

- **WHEN** browser가 `/`, `/home`, `/search`, `/@{handle}` 또는 `/@{handle}/{postId}`를 직접 요청한다
- **THEN** web server는 Expo Web entry HTML과 fingerprinted local asset을 제공한다
- **AND** Expo Router가 browser에서 canonical route를 복원한다

#### Scenario: Preserve server endpoints

- **WHEN** client가 `/health`, `/login`, `/login/callback`, `/login/native/session`, `/graphql` 또는 Fedify에 등록된 federation path를 요청한다
- **THEN** web server는 SPA fallback 전에 해당 server handler를 실행한다

#### Scenario: Serve unknown client route

- **WHEN** browser가 server endpoint가 아닌 Expo client route를 직접 요청한다
- **THEN** web server는 SPA entry를 반환해 deep link를 지원한다

### Requirement: Lightweight web BFF runtime

웹 workload는 UI framework server rendering에 의존하지 않고 auth, GraphQL proxy, federation, health와 static asset 제공만 수행해야 한다(MUST).

#### Scenario: Start production web workload

- **WHEN** container entrypoint가 `web` command로 시작된다
- **THEN** web BFF는 configured port에서 health와 Expo asset을 제공한다
- **AND** Kubernetes liveness `/health`와 readiness `/` probe가 성공한다

#### Scenario: Give federation first priority

- **WHEN** canonical web origin으로 임의의 request가 들어온다
- **THEN** BFF는 다른 server handler와 SPA fallback보다 먼저 `@kosmo/fedify` federation fetch handler에 요청을 전달한다
- **AND** Fedify가 `onNotFound` 또는 `onNotAcceptable` callback을 호출한 경우에만 나머지 BFF route를 실행한다
- **AND** Fedify가 처리한 request는 일반 Expo route로 fallback하지 않는다
- **AND** federation 표현을 요청한 미존재 resource는 SPA HTML이 아니라 federation 404를 유지한다

#### Scenario: Proxy federation representations during Expo development

- **WHEN** Expo 개발 서버에 고유 federation media type의 `Accept` 또는 `Content-Type`을 가진 임의 경로 request가 들어온다
- **THEN** 개발 서버는 pathname allowlist와 무관하게 request를 BFF에 전달한다
