## Context

`searchProfiles`는 `apps/api/src/graphql/resolvers/profile/query/by-handle.ts`에서 public root connection으로 등록되어 있다. resolver는 먼저 configured local Instance를 조회하고 입력을 local/remote handle로 정규화한 뒤, 앞뒤 wildcard가 있는 SQL `LIKE`로 Profile 후보를 조회한다. `/search` 화면은 보호 라우트이지만 API `/graphql`은 직접 노출되며 Web 프록시도 세션이 없으면 인증 헤더 없이 요청을 전달하므로, UI guard는 API 보안 경계가 아니다.

GraphQL builder는 request context의 현재 Session 유무로 `login` scope를, selected Profile 유무로 `usingProfile` scope를 계산한다. scope 실패는 기존 `PermissionDeniedError` 경로로 변환된다. `searchProfiles`와 같은 connection에도 `t.withAuth(...).connection(...)` 패턴을 사용할 수 있고, field scope는 resolver보다 먼저 평가된다.

현재 search integration test는 인증 없이 local/remote 부분 검색, literal `LIKE` escape, staged visibility, ID cursor pagination과 remote 비물질화를 검증한다. 인증을 추가하면 이 성공 경로들은 유효한 Session token을 제공하도록 정렬해야 하며, exact `profileByHandle`의 공개 조회 계약은 별도로 유지해야 한다.

## Goals / Non-Goals

**Goals:**

- `searchProfiles` resolver와 모든 후보 DB 조회 전에 Account 로그인 scope를 검증한다.
- 로그인 Account에 selected Profile이 없어도 검색할 수 있게 `login`과 `usingProfile` 경계를 구분한다.
- 기존 GraphQL permission error 표현을 재사용한다.
- 기존 검색 shape, local/remote 범위, visibility, escape와 cursor 동작을 인증된 요청에서 보존하고 회귀 테스트한다.

**Non-Goals:**

- `profileByHandle` 또는 다른 공개 Profile 조회의 인증 정책 변경
- Web 프록시·native Relay transport·보호 라우트 변경
- SQL 검색식, cursor, visibility predicate, schema shape와 Relay artifact 변경
- DB index/migration, GraphQL 전역 rate/complexity limit와 인증 Account abuse control 도입

## Implementation Guidance

### Current Constraints

- `searchProfiles`와 공개 `profileByHandle`가 같은 resolver 파일에 있으므로 모듈 전체나 Profile type에 auth scope를 적용하면 exact 공개 조회까지 막을 수 있다.
- resolver 내부에서 context를 수동 검사하면 configured local Instance 조회보다 늦게 실행되거나 기존 scope error 표현과 달라질 수 있다.
- `usingProfile` scope는 selected Profile이 없는 로그인 Account를 거부하므로 PROD-517의 Account 로그인 경계보다 강하다.
- 기존 부분검색 통합 테스트의 요청 helper는 token을 선택적으로 받지만 search success 요청은 token을 생략한다. 성공 회귀를 유지하려면 테스트 fixture와 호출을 인증 상태에 맞춰야 한다.
- `searchProfiles`는 non-null root field이므로 auth error가 발생한 응답의 `data` shape는 GraphQL null propagation을 따를 수 있다. 실패 테스트는 정상 data보다 error path와 permission code를 검증해야 한다.

### Recommended Approach

`searchProfiles` connection 하나만 builder의 `login` field scope로 감싸고 내부 resolver·SQL·connection 구현은 변경하지 않는 것을 기본 경로로 한다. 이렇게 하면 Pothos scope가 resolver 호출 전에 현재 Session을 확인하고, 실패를 기존 GraphQL `PermissionDeniedError` 표현으로 통일하면서 `profileByHandle`은 공개로 유지된다.

Profile integration test에서는 먼저 token 없는 직접 `searchProfiles` 호출이 permission error를 반환하는지 확인한다. 기존 부분검색 success test는 Active Session token을 제공해 local/remote 검색, literal escape, staged visibility, pagination과 비물질화 assertion을 그대로 유지한다. 별도 성공 case로 Active Session의 `activeProfileId`가 `null`이어도 검색이 허용되는지 확인하고, guest `profileByHandle` 회귀도 유지한다.

### Allowed Alternatives

GraphQL field가 resolver와 후보 조회 전에 `login` scope를 평가하고 기존 permission error 계약을 그대로 사용한다면, 동일한 builder-level auth 구성 방식은 허용한다. Web 프록시에서만 거부하거나 resolver 본문에서 수동으로 context를 검사하는 방식은 직접 API/native 경계를 놓치거나 검사 시점을 늦추므로 허용 대안이 아니다.

### Known Traps

- `profileByHandle`까지 함께 감싸 공개 프로필 route를 비로그인에서 깨뜨리지 않는다.
- `login` 대신 `usingProfile`을 사용해 selected Profile이 없는 Account를 거부하지 않는다.
- 기존 search success test를 인증 token만 추가한 채 비인증 실패와 permission error를 직접 검증하지 않는 상태로 두지 않는다.
- 인증 작업과 함께 SQL `LIKE`, pagination, visibility, schema 또는 Relay operation을 정리하지 않는다.
- UI 보호 라우트나 Web proxy 동작만으로 직접 `/graphql` 요청이 차단된다고 간주하지 않는다.

## Risks / Trade-offs

- [기존 비로그인 API 소비자는 `searchProfiles` 결과 대신 permission error를 받는다] → PROD-517이 의도한 보안 변경으로 문서화하고, 공개 exact lookup은 유지한다.
- [테스트 fixture에 인증 setup이 추가되어 기존 검색 assertion의 원인이 흐려질 수 있다] → 기존 검색 assertion을 유지하고 auth 실패·성공 경계를 별도 case로 분리한다.
- [field scope가 resolver보다 먼저 실행된다는 가정이 깨지면 후보 조회 전 거부를 보장하지 못한다] → 저장소의 기존 Pothos `withAuth(...).connection` 경계를 재사용하고, 구현 리뷰에서 resolver 내부 수동 guard가 아닌 field-level scope인지 확인한다.
- [인증된 사용자의 반복 검색 비용은 남는다] → PROD-517 제외 범위로 유지하고 별도 rate/index 계약에서 다룬다.

## Migration Plan

데이터 migration이나 client schema migration은 없다. API resolver와 통합 테스트를 함께 배포하고, 인증 없는 직접 요청의 permission error와 인증 요청의 기존 결과를 검증한다. 롤백은 field scope 제거로 가능하지만 공개 비용 증폭 경로를 다시 열기 때문에 장애 복구가 필요한 경우에만 사용한다.

## Open Questions

없음.
