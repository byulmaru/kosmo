## MODIFIED Requirements

### Requirement: Profile handle partial search

**Authority / Provenance:** `docs/domain/objects/account.md`, `docs/domain/objects/session.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md` (ADR 0017), `PROD-504`, `PROD-517`, `PROD-573`. 시스템은 이 검색 계약을 준수해야 한다(MUST).
시스템은 `searchProfiles(query:, first:, after:): ProfileConnection!`을 로그인한 Account의 요청에만 제공해야
한다(MUST). 요청 credential에서 유효한 현재 Session을 확인할 수 없으면 Profile 후보 DB 조회와 원격 actor
lookup 전에 GraphQL permission error로 거부해야 한다(MUST). 인증된 요청은 입력 query를 기존 handle 정책으로
정규화하고 DB에 저장된 Local/Remote Profile을 `Profile.id` cursor connection으로 검색해야 한다(MUST).
명시적인 `@handle@instance` qualified handle 전체가 remote handle로 파싱되고 저장된 Remote Profile이 없을
때만 기존 Fedify actor lookup과 materialization을 먼저 수행해야 하며(MUST), 저장된 actor를 검색할 때는 원격
lookup이나 refresh를 예약해서는 안 된다(MUST NOT). materialization 성공 뒤에는 반환된 Profile identity를
기준으로 기존 DB connection과 staged visibility를 다시 적용해야 한다(MUST). lookup 실패, unavailable Instance,
identity 충돌과 그 밖의 materialization 실패는 성공한 빈 connection으로 fallback해야 하며(MUST), 예상하지
못한 materialization 오류는 fallback 전에 관측해야 한다(MUST). 일반 텍스트, local handle, 불완전한 remote
handle과 `profileByHandle`은 새 원격 요청을 시작해서는 안 된다(MUST NOT).

connection은 immutable하고 유일한 `Profile.id ASC`를 cursor 순서로 사용해 페이지 사이 중복·누락 없이 결과
비용을 제한해야 한다(MUST). exact `profileByHandle`과 materialization 이후 `searchProfiles` DB 조회는 configured
local Instance의 `ProfileState.ACTIVE` Profile과, ActivityPub Instance의 `ProfileState.ACTIVE` Remote Profile 중
`InstanceState.SUSPENDED`가 아닌 Instance의 Profile만 반환하는 ADR 0017 staged visibility를 사용해야 한다
(MUST). 이 변경은 새로운 visibility 정책이나 데이터 모델을 추가하거나 Domain Limit·viewer Profile Domain
Block 공통 predicate를 선행 조건으로 요구해서는 안 된다(MUST NOT).

#### Scenario: Reject anonymous profile search before candidate or remote lookup

- **WHEN** 현재 Session으로 확인할 수 있는 credential 또는 유효한 bearer token이 없는 클라이언트가 `searchProfiles`를 호출한다
- **THEN** 시스템은 GraphQL permission error로 요청을 거부한다
- **AND** configured local 또는 remote domain의 Profile 후보 DB 조회를 실행하지 않는다
- **AND** WebFinger, actor document fetch 또는 Remote Profile materialization을 실행하지 않는다

#### Scenario: Reject invalid session credentials

- **WHEN** 폐기·만료되었거나 그 밖의 이유로 유효하지 않은 Session credential을 사용해 `searchProfiles`를 호출한다
- **THEN** 시스템은 비로그인 요청과 같은 GraphQL permission error로 요청을 거부한다
- **AND** Profile 후보 DB 조회와 remote actor lookup을 실행하지 않는다

#### Scenario: Allow an authenticated account without a selected profile

- **WHEN** 유효한 현재 Session은 있지만 selected Profile이 없는 Account가 `searchProfiles`를 호출한다
- **THEN** 시스템은 Account 로그인 인증만으로 검색 요청을 허용한다
- **AND** selected Profile 인증을 추가로 요구하지 않는다

#### Scenario: Search configured local profiles by partial handle

- **WHEN** 로그인한 클라이언트가 bare handle 일부 또는 configured local domain이 붙은 handle 일부로 검색한다
- **THEN** 시스템은 입력 handle을 기존 정책으로 정규화한다
- **AND** configured local instance에 저장된 `ProfileState.ACTIVE` Profile 중 정규화 handle이 입력 문자열을 포함하는 결과를 `Profile.id ASC` cursor page로 반환한다
- **AND** remote actor lookup이나 materialization을 수행하지 않는다

#### Scenario: Search stored remote profiles by non-explicit partial federated handle

- **WHEN** 로그인한 클라이언트가 명시적인 `@handle@instance` 전체 입력이 아닌 remote domain handle 일부로 검색한다
- **THEN** 시스템은 해당 domain의 ActivityPub instance에 이미 저장된 `ProfileState.ACTIVE` Remote Profile 중 정규화 handle이 입력 문자열을 포함하는 결과를 `Profile.id ASC` cursor page로 반환한다
- **AND** `InstanceState.SUSPENDED`가 아닌 remote Instance의 Profile만 반환한다
- **AND** WebFinger, actor document fetch·refresh 또는 새 Remote Profile materialization을 수행하지 않는다

#### Scenario: Materialize a missing remote profile for an explicit qualified handle

- **WHEN** 로그인한 클라이언트가 명시적인 `@handle@instance` 전체를 검색하고 해당 remote actor와 Profile이 아직 저장되지 않았다
- **THEN** 시스템은 기존 Fedify context와 actor materialization 경계로 해당 qualified handle을 조회한다
- **AND** 검증된 actor를 기존 Profile·ActivityPub actor 저장 계약으로 materialize한다
- **AND** materialized Profile identity를 기준으로 기존 DB connection과 staged visibility를 적용한 Profile edge를 반환한다
- **AND** GraphQL field와 connection shape는 변경하지 않는다

#### Scenario: Reuse a stored remote profile without network refresh

- **WHEN** 로그인한 클라이언트가 명시적인 `@handle@instance` 전체를 검색하고 해당 active Remote Profile과 actor metadata가 이미 저장되어 있다
- **THEN** 시스템은 저장된 Profile identity를 기존 DB connection에서 반환한다
- **AND** actor의 `lastFetchedAt`이 stale이어도 WebFinger, actor document fetch 또는 background refresh를 예약하지 않는다

#### Scenario: Return a canonical actor found through an alias domain

- **WHEN** 명시적인 원격 qualified handle lookup이 요청 domain과 다른 canonical actor domain의 기존 또는 새 Profile을 해석한다
- **THEN** 시스템은 별도 alias Profile을 만들지 않는다
- **AND** materializer가 반환한 canonical Profile identity를 기존 DB connection에서 조회해 결과 edge로 반환한다

#### Scenario: Fall back when explicit remote materialization cannot produce a profile

- **WHEN** 명시적인 원격 검색의 lookup이 actor를 찾지 못하거나 Instance가 unavailable이거나 identity 충돌 또는 검증 실패가 발생한다
- **THEN** 시스템은 GraphQL 요청을 5xx 오류로 끝내지 않는다
- **AND** 기존 connection shape의 빈 결과를 반환한다
- **AND** partial search, `profileByHandle` 또는 프로필 route로 materialization을 확대하지 않는다

#### Scenario: Observe an unexpected materialization failure and keep search fallback

- **WHEN** 명시적인 원격 검색의 materialization 경계에서 예상하지 못한 오류가 발생한다
- **THEN** 시스템은 기존 API 관측 경계에 오류를 기록한다
- **AND** materialization 이후 DB 검색을 실행하지 않고 성공한 빈 connection으로 fallback한다

#### Scenario: Preserve idempotency for concurrent explicit remote searches

- **WHEN** 같은 미저장 `@handle@instance`를 여러 인증 요청이 동시에 처음 검색한다
- **THEN** 시스템은 기존 materializer의 transaction, lock과 uniqueness 경계를 적용한다
- **AND** 같은 actor URI와 canonical handle에 대해 Profile과 actor metadata를 각각 하나만 유지한다
- **AND** 성공한 각 요청은 같은 canonical Profile identity를 검색 결과로 반환할 수 있다

#### Scenario: Treat LIKE metacharacters as literal search text

- **WHEN** 로그인한 클라이언트의 검색어에 `%`, `_` 또는 SQL `LIKE` escape 문자가 포함된다
- **THEN** 시스템은 사용자 입력 메타문자를 먼저 escape하여 일반 검색 문자로 취급한다
- **AND** escape된 정규화 검색어의 양쪽에만 부분 일치용 `%`를 추가한다
- **AND** 완성된 검색 패턴은 SQL 문자열에 직접 보간하지 않고 parameter binding으로 전달한다
- **AND** 사용자 입력은 의도하지 않은 wildcard 검색이나 remote materialization trigger를 만들지 않는다

#### Scenario: Paginate partial matches without duplicates or omissions

- **WHEN** 로그인한 클라이언트가 조회할 수 있는 Profile 수가 요청한 `first`보다 많다
- **THEN** 시스템은 immutable한 `Profile.id ASC` 순서의 첫 페이지와 다음 `after` cursor를 반환한다
- **AND** 다음 페이지는 앞 페이지 Profile을 중복하거나 아직 남은 Profile을 누락하지 않는다
- **AND** 페이지 사이에 Profile의 normalized handle이 변경되어도 ID cursor 경계가 바뀌지 않는다
- **AND** 마지막 페이지는 다음 페이지가 없음을 나타낸다

#### Scenario: Keep exact handle lookup and profile routes compatible

- **WHEN** 프로필 route 또는 기존 소비자가 exact `profileByHandle` 조회를 사용한다
- **THEN** 시스템은 기존 단건 exact lookup의 입력·출력과 공개 조회 인증 계약을 유지한다
- **AND** `searchProfiles`의 로그인 요구사항을 `profileByHandle`에 적용하지 않는다
- **AND** `profileByHandle`, 프로필 GET와 followers·following·post 하위 route는 Remote Profile을 materialize하지 않는다
