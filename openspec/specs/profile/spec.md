## Purpose

kosmo 프로필 capability의 현재 계약을 문서화한다. 이 스펙은 프로필 identity, 계정-프로필 역할, 조회, 생성, 수정, 비활성화, 활성 프로필 선택을 다룬다.

## Requirements

### Requirement: Profile identity

시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고, configured local profile과 저장된 ActivityPub remote profile에 대한 DB-only handle 기반 조회를 지원해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 상태, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 신규 프로필 상태는 `ACTIVE`이다

#### Scenario: Find active local profile by bare or local-domain handle

- **WHEN** 클라이언트가 bare handle 또는 configured local domain의 `handle@domain`/`@handle@domain` 형식 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 configured local instance에 속한 활성 프로필을 조회한다
- **AND** 일치하는 활성 configured local profile이 있으면 해당 프로필을 반환한다

#### Scenario: Find stored active remote profile by federated handle

- **WHEN** 클라이언트가 configured local domain이 아닌 `handle@domain` 또는 `@handle@domain` 형식의 federated handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle과 domain을 정규화한다
- **AND** 시스템은 kosmo DB에서 해당 domain의 suspended 상태가 아닌 instance와 normalized handle에 일치하는 활성 remote `Profile`을 조회한다
- **AND** 일치하는 저장된 활성 remote profile이 있으면 해당 프로필을 반환한다
- **AND** 시스템은 `profileByHandle` 처리 중 WebFinger, actor document fetch, actor refresh, remote profile 저장을 수행하지 않는다

#### Scenario: Missing stored remote profile by handle

- **WHEN** federated handle에 해당하는 저장된 활성 remote profile이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다
- **AND** 시스템은 remote actor materialization을 자동으로 시도하지 않는다

#### Scenario: Missing profile by handle

- **WHEN** configured local instance 안에서 정규화된 handle과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

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

### Requirement: Profile relative handle

API는 프로필 표시용 handle 문자열을 configured local instance 기준 `relativeHandle`로 제공해야 한다(MUST).

#### Scenario: Relative handle for configured local profile

- **WHEN** 클라이언트가 configured local instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}` 형식의 문자열을 반환한다

#### Scenario: Relative handle for profile outside configured local instance

- **WHEN** 클라이언트가 configured local instance가 아닌 instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}@{instanceDomain}` 형식의 문자열을 반환한다
- **AND** 해당 instance가 `LOCAL` kind여도 configured local instance가 아니면 domain을 포함한다

### Requirement: Profile object visibility

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — API는 활성 local profile과 저장된 활성 ActivityPub remote profile을 GraphQL profile object로 조회할 수 있게 해야 한다(MUST). Profile object는 연결된 Hashtag global `id`와 first-write-wins Display Hashtag Name `name`을 제공하는 non-null `tags: [Hashtag!]!` field를 가져야 하며(MUST). 배열의 요소 순서는 API 계약이 아니다. Local 여부는 configured instance ID가 아니라 Profile Origin과 연결된 Instance Kind로 판정해 모든 Local Profile의 유효한 관계를 반환하고 Remote Profile은 빈 목록을 반환해야 하며(MUST), 현재 범위에서 Local Profile Tag만 반환해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** local profile 상태가 `ACTIVE`이고 소속 instance가 차단되지 않았다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드와 연결된 tags를 노출한다
- **AND** Profile Tag가 없으면 tags는 빈 목록이다
- **AND** Local 판정은 Profile Origin과 연결된 Instance Kind를 사용하며 configured Local Instance ID에 제한하지 않는다
- **AND** Node ID 기반 profile load는 활성 local profile을 반환할 수 있다

#### Scenario: Access active remote profile object

- **WHEN** ActivityPub remote profile 상태가 `ACTIVE`이고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Remote Profile Tag 수집·표시는 제외되므로 tags는 빈 목록이다
- **AND** Node ID 기반 profile load는 활성 remote profile을 반환할 수 있다

#### Scenario: Access profile from suspended instance

- **WHEN** 프로필이 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 해당 프로필 object 접근을 허용하지 않는다
- **AND** Profile Tag를 별도 경로로 노출하지 않는다

#### Scenario: Access inactive profile object

- **WHEN** 프로필 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용하지 않는다
- **AND** Profile Tag를 별도 경로로 노출하지 않는다

### Requirement: Account-profile membership

**Authority / Provenance:** `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `PROD-489` 시스템은 계정과 프로필의 관계를 Owner 또는 Member 역할이 있는 membership으로 관리해야 한다(MUST).

#### Scenario: Represent supported membership roles

- **WHEN** 시스템이 Account Profile Role을 application, GraphQL 또는 PostgreSQL schema에서 표현한다
- **THEN** 지원 역할은 `OWNER`와 `MEMBER`뿐이다
- **AND** `ADMIN` 역할을 노출하거나 저장하지 않는다

#### Scenario: Create owned profile membership

- **WHEN** 로그인한 계정이 프로필을 생성한다
- **THEN** 시스템은 생성된 프로필과 현재 계정을 연결한다
- **AND** 현재 계정의 역할은 `OWNER`이다

#### Scenario: Prevent duplicate membership

- **WHEN** 계정과 프로필의 membership이 이미 존재한다
- **THEN** 시스템은 같은 계정과 프로필 조합의 membership을 중복 저장하지 않는다

### Requirement: Profile creation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-816`, `PROD-878` — 이 요구사항을 MUST
준수한다.
로그인한 계정은 형식, configured Local Instance 안의 유일성, System Reserved Handle 정책을 통과한 handle로
자신이 소유한 configured local profile을 생성할 수 있어야 한다(MUST). 시스템은 Local Profile 생성의 모든
진입점에서 System Reserved Handle 정책을 서버 권위로 적용해야 하며(MUST), 정책 위반을 일치한 예약
식별자나 내부 목록을 노출하지 않는 `handle` field 오류로 반환해야 한다(MUST).

System Reserved Handle은 앞뒤 공백을 제거하고 소문자로 바꾼 Local handle 전체를 아래 집합과 정확히 비교해야
한다(MUST). Remote Profile의 원격 handle에는 이 정책을 적용하지 않으며 원격 원본 값을 보존해야 한다(MUST).
비교에는 부분 문자열 검색, underscore 제거 또는 숫자 치환을 적용해서는 안 된다(MUST NOT).

- 운영 권한·공식 계정: `abuse`, `adm`, `admin`, `admins`, `administration`, `administrator`,
  `administrators`, `moderator`, `moderators`, `official`, `operator`, `owner`, `owners`, `root`, `security`,
  `staff`, `support`, `system`
- 인증·고객지원·정책: `api`, `auth`, `authentication`, `contact`, `contactus`, `copyright`, `dmca`, `help`,
  `hostmaster`, `legal`, `login`, `logout`, `oauth`, `policies`, `policy`, `postmaster`, `privacy`, `register`,
  `registration`, `report`, `reports`, `status`, `terms`, `tos`, `webmaster`
- Kosmo·연합·시스템 endpoint: `activitypub`, `actor`, `actors`, `ap`, `byulmaru`, `federation`, `fediverse`,
  `graphql`, `health`, `inbox`, `kosmo`, `nodeinfo`, `outbox`, `webfinger`
- 앱 최상위 정적 route namespace: `bookmarks`, `compose`, `feedback`, `hashtags`, `home`, `local`,
  `notifications`, `search`, `settings`
- 공식 계정으로 오인하기 쉬운 조합: `kosmo_admin`, `kosmo_moderator`, `kosmo_official`, `kosmo_security`,
  `kosmo_support`

`login`과 `privacy`는 현재 앱 route이면서 인증·고객지원·정책 목록에 이미 포함해야 한다(MUST).
`follow-requests`와 `profile-edit`처럼 하이픈을 포함한 route는 Local handle 문자 형식에서 거부해야 하며(MUST),
System Reserved 목록에 같은 의미의 underscore 별칭을 임의로 추가해서는 안 된다(MUST NOT). 앱의 최상위 정적
route를 추가하거나 이름을 바꿀 때 그 segment가 Local handle 문자 형식으로 생성 가능하면 route 변경과 같은
배포 단위에서 System Reserved 목록과 공용 검증을 함께 갱신해야 한다(MUST).

유해표현의 판정, 신고, 심사, 제재, 이의제기와 목록 소유권은 System Reserved Handle과 별개의 모더레이션
생명주기에서 다룬다. 이 요구사항은 해당 목록·판정 규칙·결과·집행을 정의하지 않으며, 값이 과거 유해표현 정책의
대상이었다는 이유만으로 현재 Local Profile 생성을 거부하지 않는다(MUST). 이는 유해표현 handle을
영구적으로 허용한다는 약속이 아니며 새로운 모더레이션 구현을 추가하지 않는다.

System Reserved Handle 정책은 새 Local Profile 생성 요청에만 적용해야 한다(MUST). Profile Lifecycle State와
handle 재사용 가능 여부는 이 정책에 우선해서는 안 된다(MUST NOT). 정책 도입 전에 생성된 Local Profile은
현재 목록이나 비교 규칙과 충돌해도 기존 handle과 lifecycle을 그대로 유지해야 하며(MUST), 그 충돌만을 이유로
자동 rename·disable·delete해서는 안 된다(MUST NOT). 기존 충돌의 전체 현황 점검과 후속 cleanup은 PROD-878의
별도 lifecycle에서 다루며, 그 완료 여부를 신규 생성 정책 배포의 선행 조건으로 삼아서는 안 된다(MUST NOT).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 형식, 유일성과 System Reserved Handle 정책을 통과한 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 configured local instance에 속한 local profile로 handle과 정규화된 handle을 저장한다
- **AND** 표시 이름은 handle과 같은 값으로 초기화된다
- **AND** 팔로우 정책은 `OPEN`으로 초기화된다
- **AND** mutation은 `CreateProfilePayload.profile`로 생성된 `Profile`을 반환한다
- **AND** mutation은 `CreateProfilePayload.account`로 현재 계정과 갱신된 프로필 목록을 반환한다

#### Scenario: Create profile with duplicate local handle

- **WHEN** 로그인한 계정이 configured local instance 안에서 이미 사용 중인 정규화 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 `handle` field의 conflict 오류를 반환한다

#### Scenario: Create profile with remote-only duplicate handle

- **WHEN** 로그인한 계정이 다른 ActivityPub instance에만 존재하는 정규화 handle로 local profile 생성을 요청한다
- **THEN** 시스템은 그 remote profile을 local handle conflict로 취급하지 않는다
- **AND** System Reserved Handle 정책을 포함한 다른 생성 검증을 통과하면 configured local instance에 새 profile을 생성할 수 있다

#### Scenario: Reject a case-insensitive reserved handle

- **WHEN** 로그인한 계정이 `Admin`처럼 대소문자만 다른 System Reserved Handle로 Local Profile 생성을 요청한다
- **THEN** 시스템은 Profile을 생성하지 않고 handle field 오류를 반환한다
- **AND** 응답은 일치한 예약 식별자나 전체 목록을 노출하지 않는다

#### Scenario: Reject a handle that occupies a current app route namespace

- **WHEN** 로그인한 계정이 `notifications`, `settings` 또는 `hashtags`처럼 Local handle 문자 형식으로 생성
  가능한 현재 앱 최상위 정적 route namespace로 Local Profile 생성을 요청한다
- **THEN** 시스템은 Profile을 생성하지 않고 handle field 오류를 반환한다
- **AND** 정적 앱 route와 동적 Profile route가 같은 최상위 namespace를 공유하지 않는다

#### Scenario: Reject a hyphenated route at the handle format boundary

- **WHEN** 로그인한 계정이 `follow-requests` 또는 `profile-edit`처럼 하이픈을 포함한 현재 앱 route를 Local
  Profile handle로 제출한다
- **THEN** 시스템은 System Reserved 판정에 앞선 Local handle 문자 형식 검증으로 요청을 거부한다
- **AND** `follow_requests` 또는 `profile_edit`를 route와 같은 값으로 간주하지 않는다

#### Scenario: Allow a handle that only contains a reserved substring

- **WHEN** 로그인한 계정이 `supporter`, `cybersecurity` 또는 `administrator_dev`처럼 예약 식별자를 일부만 포함한 handle로 생성을 요청한다
- **THEN** 시스템은 System Reserved Handle 정책만을 이유로 요청을 거부하지 않는다
- **AND** 다른 생성 검증을 모두 통과하면 Profile을 생성한다

#### Scenario: Allow a handle outside the current creation policy

- **WHEN** 로그인한 계정이 `porn`, `p_o_r_n` 또는 `p0rn`처럼 과거 유해표현 정책이 거부했지만 System Reserved Handle과 정확히 일치하지 않고 형식이 유효하며 configured Local Instance 안에서 중복되지 않는 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 그 값이 과거 유해표현 정책의 대상이었다는 이유만으로 Profile 생성을 거부하지 않는다
- **AND** 형식과 configured local instance 안의 유일성 검증을 통과하면 Profile과 Owner Membership을 저장한다

#### Scenario: Reject a policy violation that bypasses client validation

- **WHEN** 클라이언트 사전 검증을 사용하지 않고 API를 직접 호출해 System Reserved Handle 정책을 위반한 Local Profile handle을 제출한다
- **THEN** 서버는 Profile과 Owner Membership을 생성하지 않는다
- **AND** handle field 오류를 반환한다

#### Scenario: Keep the policy ahead of handle reuse

- **WHEN** 과거 Profile의 lifecycle 또는 삭제 처리로 같은 문자열의 재사용 가능 여부가 달라지더라도 새 handle이 System Reserved Handle과 일치한다
- **THEN** 시스템은 재사용 가능 여부와 관계없이 새 Local Profile 생성을 거부한다

#### Scenario: Preserve an existing profile that now conflicts with the policy

- **WHEN** 정책 도입 전에 생성된 Local Profile의 handle이 현재 System Reserved Handle과 충돌한다
- **THEN** 시스템은 그 충돌만을 이유로 기존 Profile을 rename·disable·delete하지 않는다
- **AND** 기존 handle과 lifecycle을 변경하지 않은 채 신규 생성 정책을 배포할 수 있다
- **AND** 기존 충돌의 전체 현황 점검과 cleanup은 PROD-878의 별도 lifecycle에서 다루며 신규 생성 정책 배포를 막지 않는다

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/architecture/core-services.md`, `PROD-489` 확정 결정 기록, `PROD-490`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`, `PROD-648`, `PROD-665` — Active Account가 현재 선택한 Profile의 Owner이고 대상 Origin이 Local이며 Lifecycle State가 `Active`, Suspension State가 `Normal`일 때만 표시 이름, bio, 팔로우 정책, 기본 Post Visibility와 전체 Profile Tag 목록을 수정할 수 있어야 한다(MUST). Profile update input은 대상 Profile ID를 받지 않고 검증된 세션의 selected Profile identity를 사용해야 한다(MUST). Member, selected Profile 없음, Deactivated Profile과 Remote Profile은 수정할 수 없어야 한다(MUST NOT). 선택적 `tags: [String!]` input에 목록이 제공되면 기존 Profile Tag 전체 목록을 같은 Profile update transaction에서 교체해야 하며(MUST), input을 생략하거나 `null`로 보내면 기존 목록을 유지해야 한다(MUST). 기본 Post Visibility는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 허용해야 한다(MUST). Core Profile action은 수정 transaction을 직접 소유하고 실제 actor-visible 변경 commit 뒤의 Effects Workflow start를 직접 시도해야 하며(MUST), caller database handle이나 caller-side post-commit lifecycle을 공개해서는 안 된다(MUST NOT).

#### Scenario: Update profile as owner

- **WHEN** Active Account가 현재 선택한 Lifecycle State `Active`, Suspension State `Normal`의 Local Profile `OWNER`로 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy, defaultPostVisibility 값을 갱신한다
- **AND** 생략된 displayName, bio, followPolicy, defaultPostVisibility 값은 변경하지 않는다
- **AND** tags가 제공되면 Hashtag identity로 검증·resolve한 전체 목록과 관계를 같은 transaction에서 교체한다
- **AND** tags가 생략되거나 `null`이면 기존 Profile Tag 관계를 유지한다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`과 tags를 반환하며 배열 순서는 계약하지 않는다
- **AND** 기본값은 nullable `private` projection의 non-null `defaultPostVisibility`로 조회할 수 있다

#### Scenario: Clear Profile Tags as owner

- **WHEN** Active Account가 현재 선택한 Active Local Profile의 `OWNER`로 tags 빈 목록을 명시해 수정을 요청한다
- **THEN** 시스템은 해당 Profile의 Profile Tag 관계를 모두 제거한다
- **AND** 다른 제공 값과 빈 tags를 포함한 갱신된 Profile을 반환한다

#### Scenario: Reject an invalid atomic update

- **WHEN** Profile update의 tags가 Hashtag Name syntax·정규화·문자·길이 또는 canonical identity 중복 검증을 통과하지 않는다
- **THEN** 시스템은 tags field와 연결된 validation 오류를 반환한다
- **AND** 같은 요청의 displayName, bio, followPolicy, defaultPostVisibility와 기존 Profile Tag 관계를 어느 것도 변경하지 않는다

#### Scenario: Reject unsupported default visibility

- **WHEN** Owner가 기본 Post Visibility로 `DIRECT` 또는 지원하지 않는 값을 제출한다
- **THEN** 시스템은 field validation 오류로 거부한다
- **AND** 기존 Profile 기본값, 다른 Profile 속성과 Profile Tag 관계를 변경하지 않는다

#### Scenario: Reject update without a usable selected Profile

- **WHEN** selected Profile이 없거나 Deactivated·Suspended 상태이거나 현재 Account가 inactive이거나 selected Profile membership이 유효하지 않다
- **THEN** 시스템은 selected Profile authorization 오류로 요청을 거부한다
- **AND** Profile Tag 관계를 변경하지 않는다

#### Scenario: Reject a selected Remote Profile update

- **WHEN** Active Account가 현재 선택한 Remote Profile의 수정을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** Profile Tag 관계를 변경하지 않는다
- **AND** Remote Profile의 기본 Post Visibility 설정을 만들거나 변경하지 않는다

#### Scenario: Reject profile update without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다
- **AND** Profile Tag 관계를 변경하지 않는다

#### Scenario: Core-owned Profile update transaction

- **WHEN** GraphQL caller가 Profile 수정을 요청한다
- **THEN** Core action은 기본 database로 transaction을 완료한 뒤 Profile 결과를 반환한다
- **AND** caller는 database handle이나 post-commit callback을 전달하거나 실행하지 않는다

### Requirement: Profile disabling

프로필 owner는 활성 프로필을 비활성화할 수 있어야 한다(MUST).

#### Scenario: Disable profile as owner

- **WHEN** 프로필의 `OWNER` 계정이 활성 프로필 삭제를 요청한다
- **THEN** 시스템은 프로필 상태를 `DISABLED`로 변경한다
- **AND** 해당 프로필을 활성 프로필로 가진 모든 세션의 active profile을 해제한다
- **AND** mutation은 `DeleteProfilePayload.profileId`로 비활성화된 `Profile` ID를 반환한다

#### Scenario: Disable missing or inaccessible profile

- **WHEN** 삭제 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Disable profile without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다

### Requirement: Active profile selection

정상 제품 경로에서 `AccountProfile`로 로그인한 계정에 연결되는 profile은 configured local instance에 생성된 local profile이다. 로그인한 계정은 자신과 연결된 profile이 active이고 소속 instance가 `SUSPENDED`가 아닐 때 현재 세션의 active profile로 선택할 수 있어야 한다(MUST). 이 requirement는 제품 경로 밖에서 인위적으로 만든 remote profile membership의 선택 또는 거부 동작을 정의하지 않는다.

#### Scenario: Select accessible active account profile

- **WHEN** 로그인한 계정이 정상 제품 경로에서 자신과 연결된 active profile 선택을 요청하고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 `Profile`을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 `Session`을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 프로필을 가리켜 클라이언트 캐시가 active profile 변경을 동기화할 수 있다

#### Scenario: Reject unowned or invisible profile selection

- **WHEN** 로그인한 계정이 자신과 연결되지 않았거나 active가 아니거나 소속 instance가 `SUSPENDED`인 profile 선택을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 profile이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Profile follow graph

API는 local profile과 ActivityPub remote profile이 참여하는 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST). Remote ActivityPub followers/following collection item은 fetch하거나 mirror하지 않고, kosmo DB에 저장된 known `ProfileFollow` 관계만 GraphQL followers/following connection에 반영해야 한다(MUST). Local profile과 ActivityPub remote profile의 followers/following count는 `profile` row에 저장된 count를 사용해야 한다(MUST).

#### Scenario: Read followers for local or remote profile

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하는 established `ProfileFollow` 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** follower profile은 활성 local profile 또는 활성 ActivityPub remote profile일 수 있다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다
- **AND** 조회 대상이 ActivityPub remote profile이어도 remote followers collection을 fetch하거나 mirror하지 않는다

#### Scenario: Read following for local or remote profile

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하는 established `ProfileFollow` 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** followee profile은 활성 local profile 또는 활성 ActivityPub remote profile일 수 있다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다
- **AND** 조회 대상이 ActivityPub remote profile이어도 remote following collection을 fetch하거나 mirror하지 않는다

#### Scenario: Count stored follows

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `profile` row에 저장된 followers count 또는 following count를 반환한다
- **AND** GraphQL count 조회 중 `ProfileFollow` aggregate query 또는 remote collection fetch를 수행하지 않는다
- **AND** 반환 count는 GraphQL non-null count 계약을 유지한다
- **AND** local/remote profile 모두 반환 count는 화면 표시와 mutation cache 갱신을 위한 best-effort 값이며, followers/following connection의 edge 수와 같을 필요가 없다
- **AND** followers/following connection이 visible relation membership의 source of truth다

#### Scenario: Exclude disabled profiles from stored counts

- **WHEN** active profile이 비활성화된다
- **THEN** 시스템은 profile follow row를 삭제하지 않고 남은 active profile들의 저장 followersCount/followingCount에서 해당 비활성 profile과의 관계를 제외한다

#### Scenario: Read public follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이고 두 프로필의 `followPolicy`가 모두 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이면 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from follow graph

- **WHEN** local 또는 ActivityPub remote profile 사이에 pending `ProfileFollowRequest`가 있다
- **THEN** 시스템은 해당 요청을 followers/following connection, followersCount, followingCount, `viewerState.follow` 결과에 `ProfileFollow`로 노출하지 않는다
- **AND** pending request는 local profile 또는 ActivityPub remote profile의 저장 count를 변경하지 않는다

#### Scenario: Read viewer state

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 `viewerState`를 조회한다
- **THEN** 시스템은 현재 요청에 active profile이 선택되어 있으면 viewer-relative 상태를 반환한다
- **AND** 현재 요청에 active profile이 없으면 없음으로 응답한다
- **AND** 조회 대상 프로필이 viewer active profile 자신인지 `isSelf`로 반환한다
- **AND** viewer active profile이 대상 프로필을 follow하는 established `ProfileFollow` 관계가 있으면 `viewerState.follow`로 반환하고, 없으면 없음으로 응답한다
- **AND** viewer active profile이 대상 프로필에 보낸 pending `ProfileFollowRequest`가 있으면 `viewerState.followRequest`로 반환하고, 없으면 없음으로 응답한다
- **AND** `viewerState.follow`과 `viewerState.followRequest`는 같은 viewer/target pair에서 동시에 존재하지 않는다
- **AND** pending `ProfileFollowRequest`만 있으면 `viewerState.follow`는 없음으로 응답하고 저장 count를 변경하지 않는다
- **AND** 완료된 PROD-378 계약에 따라 `Profile.viewerState.follow`을 canonical established relation field로 사용하고 제거된 `Profile.viewerFollow`를 복원하지 않는다
- **AND** API는 `Profile.viewerFollowRequest` top-level 대칭 필드를 추가하지 않는다
- **AND** 대상 프로필이 ActivityPub remote profile이어도 remote followers/following collection을 fetch하거나 mirror하지 않는다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 local profile 또는 ActivityPub remote profile에 established follow 또는 pending follow request를 생성할 수 있어야 하며, mutation은 결과를 `ProfileFollowResult` union으로 반환해야 한다(MUST).

#### Scenario: Follow open active local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 local profile follow를 요청한다
- **THEN** 시스템은 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** mutation은 `FollowProfilePayload.result`로 `ProfileFollow`를 반환한다
- **AND** mutation은 `FollowProfilePayload.followerProfile`과 `FollowProfilePayload.followeeProfile`로 transaction 완료 시점의 양쪽 `Profile`을 반환한다
- **AND** `followerProfile.followingCount`와 `followeeProfile.followersCount`는 생성된 관계가 반영된 저장 count다

#### Scenario: Follow open active remote profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local active profile을 follower, remote profile을 followee로 하는 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 새 `ProfileFollow` 관계가 생성되면 `activitypub-remote-follow`의 instance-state와 delivery 계약을 따른다
- **AND** remote delivery가 실패하더라도 생성된 local `ProfileFollow` 관계와 저장 count를 rollback하지 않는다
- **AND** delivery 실패는 GraphQL mutation 실패로 노출하지 않고 committed `ProfileFollow`, `followerProfile`, `followeeProfile` payload를 반환한다
- **AND** 새 `ProfileFollow` 관계가 생성되었지만 remote instance 상태가 `UNRESPONSIVE`이면 ActivityPub `Follow` activity를 발송하지 않는다
- **AND** 기존 `ProfileFollow` 관계를 반환하는 idempotent 요청에서는 ActivityPub `Follow` activity를 다시 발송하지 않는다
- **AND** mutation은 `FollowProfilePayload.result`로 `ProfileFollow`를 반환한다
- **AND** mutation은 최신 저장 count를 가진 `followerProfile`과 `followeeProfile`을 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.result`로 기존 `ProfileFollow`를 반환한다
- **AND** mutation은 count를 중복 증가시키지 않은 최신 `followerProfile`과 `followeeProfile`을 반환한다
- **AND** 오류로 처리하지 않는다
- **AND** 대상이 ActivityPub remote profile이면 ActivityPub `Follow` activity를 다시 발송하지 않는다

#### Scenario: Follow approval-required active profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `APPROVAL_REQUIRED`인 활성 local 또는 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 pending `ProfileFollowRequest`를 생성하거나 기존 request를 반환한다
- **AND** mutation은 `FollowProfilePayload.result`로 `ProfileFollowRequest`를 반환한다
- **AND** relation과 저장 count를 변경하지 않는다
- **AND** 대상이 ActivityPub remote profile이면 `activitypub-remote-follow`의 ACTIVE/UNRESPONSIVE delivery 정책을 따른다
- **AND** remote delivery 실패는 GraphQL mutation 실패로 노출하지 않고 committed `ProfileFollowRequest`, `followerProfile`, `followeeProfile` payload를 반환한다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다

#### Scenario: Require active profile to follow

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `followProfile` mutation을 요청한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** profile not found 오류로 처리하지 않는다

#### Scenario: Follow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 `SUSPENDED` instance의 remote profile follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 관계를 생성하지 않는다
- **AND** ActivityPub Follow를 발송하지 않는다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 local 또는 ActivityPub remote follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 transaction 완료 시점의 `followerProfile`과 `followeeProfile`을 포함한다.

#### Scenario: Unfollow active local profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** mutation은 감소된 `followingCount`를 가진 `followerProfile`과 감소된 `followersCount` 및 갱신된 viewer follow 상태를 가진 `followeeProfile`을 함께 반환한다

#### Scenario: Unfollow active remote profile

- **WHEN** active profile이 있는 인증자가 `SUSPENDED` instance가 아닌 활성 ActivityPub remote profile을 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** 삭제된 remote relation의 Undo는 `activitypub-remote-follow`의 instance-state와 delivery 계약을 따른다
- **AND** remote delivery가 실패하더라도 삭제된 local `ProfileFollow` 관계와 저장 count를 rollback하지 않는다
- **AND** delivery 실패는 GraphQL mutation 실패로 노출하지 않고 삭제된 relation id와 committed `followerProfile`, `followeeProfile` payload를 반환한다
- **AND** remote instance 상태가 `UNRESPONSIVE`이면 ActivityPub `Undo(Follow)` activity를 발송하지 않는다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** mutation은 감소된 저장 count를 가진 `followerProfile`과 `followeeProfile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 count를 변경하지 않은 최신 `followerProfile`과 `followeeProfile`을 포함한 `UnfollowProfilePayload`를 반환한다
- **AND** 대상이 ActivityPub remote profile이면 ActivityPub `Undo(Follow)` activity를 발송하지 않는다

#### Scenario: Preserve suspended remote follow

- **WHEN** active profile이 있는 인증자가 `SUSPENDED` instance의 ActivityPub remote profile을 이미 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계와 양쪽 저장 count를 변경하지 않는다
- **AND** ActivityPub `Undo(Follow)` activity를 발송하지 않는다

#### Scenario: Require active profile to unfollow

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `unfollowProfile` mutation을 요청한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** profile not found 오류로 처리하지 않는다

#### Scenario: Unfollow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 관계 유무와 관계없이 `SUSPENDED` instance의 remote profile unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다
- **AND** ActivityPub `Undo(Follow)` activity를 발송하지 않는다

### Requirement: Account profile list query

API는 로그인한 계정이 app-shell 프로필 전환을 위해 해당 계정과 연결된 활성 프로필을 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read accessible active profiles

- **WHEN** 로그인한 계정이 접근 가능한 프로필 목록을 요청한다
- **THEN** 시스템은 해당 계정과 연결된 활성 프로필을 반환한다
- **AND** 반환된 각 프로필은 profile object가 노출하는 프로필 필드를 포함한다

#### Scenario: Hide inaccessible profiles from account list

- **WHEN** 로그인한 계정이 접근 가능한 프로필 목록을 요청한다
- **THEN** 시스템은 비활성 프로필이나 해당 계정과 연결되지 않은 프로필을 반환하지 않는다

### Requirement: Profile instance kind

API는 같은 `Profile` 타입 안에서 소속 instance의 `kind`를 `Profile.instance.kind`로 노출해야 한다(MUST).

#### Scenario: Instance kind for local profile

- **WHEN** 클라이언트가 configured local instance에 속한 활성 profile의 `instance.kind`를 조회한다
- **THEN** 시스템은 `LOCAL`을 반환한다

#### Scenario: Instance kind for ActivityPub profile

- **WHEN** 클라이언트가 ActivityPub instance에 속한 활성 profile의 `instance.kind`를 조회한다
- **THEN** 시스템은 `ACTIVITYPUB`을 반환한다

#### Scenario: Use instance kind for UI branching

- **WHEN** 클라이언트가 local-only 또는 ActivityPub-specific UI를 분기해야 한다
- **THEN** 클라이언트는 `relativeHandle` 문자열을 파싱하지 않고 `Profile.instance.kind`를 사용할 수 있어야 한다

#### Scenario: Link to stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`을 사용하고 `Profile.instance.kind`로 UI를 분기한다
- **AND** remote profile 링크는 `/${relativeHandle}` path로 이동한다
- **AND** `relativeHandle`은 `@handle@domain` 형식이고, route parameter는 `handle@domain`으로 전달되어 `profileByHandle`이 federated handle로 조회할 수 있어야 한다

#### Scenario: Link within stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile page 안에서 하위 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`을 사용하고 `Profile.instance.kind`로 UI를 분기한다
- **AND** 하위 링크는 `/${relativeHandle}` path 아래에서 route parameter가 `handle@domain`으로 전달되는 federated handle URL을 유지한다

#### Scenario: Use instance kind for remote follow action

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile을 표시한다
- **THEN** 클라이언트는 `instance.kind = ACTIVITYPUB`이라는 이유만으로 follow/unfollow action을 숨기거나 비활성화하지 않는다
- **AND** remote follow action 표시 여부는 `web-app-shell`의 remote profile follow actions 계약을 따른다

### Requirement: Pending follow request lifecycle

시스템은 local 또는 remote profile 사이에 이미 저장된 pending `ProfileFollowRequest`를 같은 core lifecycle로 조회·승인·거절·취소할 수 있어야 한다(MUST).

#### Scenario: Find pending request by participant pair

- **WHEN** 시스템이 follower/followee profile pair로 pending request를 조회한다
- **THEN** 동일 pair의 `ProfileFollowRequest`가 있으면 반환한다
- **AND** 없으면 없음으로 응답한다

#### Scenario: Approve incoming request

- **WHEN** active profile이 pending request의 followee이고 요청 승인을 실행한다
- **THEN** 시스템은 request를 삭제하고 성립된 `ProfileFollow`를 생성하거나 기존 관계를 반환한다
- **AND** 삭제된 request ID와 follower/followee Profile을 반환한다

#### Scenario: Reject incoming request

- **WHEN** active profile이 pending request의 followee이고 요청 거절을 실행한다. 이때 follower가 비활성이거나 remote instance가 `SUSPENDED`일 수 있다
- **THEN** 시스템은 request를 삭제한다
- **AND** 삭제된 request ID와 행동자인 non-null `followeeProfile`을 반환한다
- **AND** unavailable일 수 있는 follower Profile은 payload에 포함하지 않는다
- **AND** relation과 저장 count를 변경하지 않는다

#### Scenario: Cancel outgoing request

- **WHEN** active profile이 pending request의 follower이고 요청 취소를 실행한다. 이때 followee가 비활성이거나 remote instance가 `SUSPENDED`일 수 있다
- **THEN** 시스템은 request를 삭제한다
- **AND** 삭제된 request ID와 행동자인 non-null `followerProfile`을 반환한다
- **AND** unavailable일 수 있는 followee Profile은 payload에 포함하지 않는다
- **AND** relation과 저장 count를 변경하지 않는다

#### Scenario: Hide unauthorized request transition

- **WHEN** active profile이 request participant가 아니거나 승인·거절 주체인 followee 또는 취소 주체인 follower가 아니다
- **THEN** 시스템은 존재하지 않는 request와 구분되지 않는 request not found 오류를 반환한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Reject approval with unavailable participant

- **WHEN** request participant가 비활성 상태이거나 remote participant의 instance가 `SUSPENDED`인 상태에서 승인을 실행한다
- **THEN** 시스템은 승인을 거부한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Repeat completed request transition

- **WHEN** 이미 처리되어 존재하지 않는 request ID로 승인·거절·취소를 다시 실행한다
- **THEN** 시스템은 request not found 오류를 반환한다
- **AND** relation과 저장 count를 추가로 변경하지 않는다

### Requirement: Profile-owned follow request connections

API는 현재 active profile이 참여하는 pending follow request를 해당 `Profile`이 소유하는 incoming/outgoing connection으로 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read own incoming requests

- **WHEN** active profile이 있는 인증자가 같은 active profile의 incoming follow request connection을 조회한다
- **THEN** 시스템은 해당 profile이 followee인 visible pending request를 안정적이고 결정적인 순서로 반환한다
- **AND** 각 edge의 node는 `ProfileFollowRequest`이다

#### Scenario: Read own outgoing requests

- **WHEN** active profile이 있는 인증자가 같은 active profile의 outgoing follow request connection을 조회한다
- **THEN** 시스템은 해당 profile이 follower인 visible pending request를 안정적이고 결정적인 순서로 반환한다
- **AND** 각 edge의 node는 `ProfileFollowRequest`이다

#### Scenario: Hide another profile's request connections

- **WHEN** 인증자가 현재 active profile과 다른 Profile의 incoming 또는 outgoing follow request connection을 조회한다
- **THEN** 시스템은 connection을 `null`로 반환한다
- **AND** request 존재 여부를 노출하지 않는다

#### Scenario: Keep request visible for participant cleanup

- **WHEN** 현재 active profile이 pending request의 participant이고 다른 participant가 비활성 상태이거나 remote instance가 `SUSPENDED`이다
- **THEN** 시스템은 해당 request를 현재 active profile의 incoming/outgoing connection에서 반환한다
- **AND** unavailable participant의 Profile 필드는 해당 Profile의 visibility 계약에 따라 `null`일 수 있다

#### Scenario: Paginate requests deterministically

- **WHEN** participant가 변경되지 않은 pending request connection을 opaque cursor로 페이지 이동한다
- **THEN** 시스템은 각 visible request를 결정적인 전체 순서에 따라 반환한다
- **AND** before/after 페이지 이동에서 request를 중복하거나 누락하지 않는다

### Requirement: Profile 기본 Post Visibility 조회

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-648` MUST: API는 현재 Account가 Member인 Local Profile에 nullable `Profile.private` projection과 그 안의 non-null
`defaultPostVisibility`를 제공해야 한다(MUST). 값은 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나여야 하며(MUST),
저장값이 없는 Local Profile은 `UNLISTED`로 반환해야 한다(MUST). Remote Profile이나 현재 Account가 Member가
아닌 Profile에는 `Profile.private`를 `null`로 반환해 Kosmo Local 설정을 노출해서는 안 된다(MUST NOT).

#### Scenario: Local Profile Member가 기본값 조회

- **WHEN** 현재 Account가 Local Profile의 Owner 또는 Member이고 해당 Profile의 `private.defaultPostVisibility`를 조회한다
- **THEN** API는 `Profile.private` projection 안에 저장된 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 non-null로 반환한다
- **AND** 저장값이 없으면 `UNLISTED`를 반환한다

#### Scenario: Remote Profile 기본값 비노출

- **WHEN** 클라이언트가 Remote Profile의 `private` projection을 조회한다
- **THEN** API는 `Profile.private`를 `null`로 반환해 Kosmo Local 기본값이 없음을 나타낸다
- **AND** Remote Profile에 fallback 값을 저장하거나 설정 조회를 허용하지 않는다

#### Scenario: Member가 아닌 Account 기본값 비노출

- **WHEN** 현재 Account가 대상 Local Profile의 Owner 또는 Member가 아니다
- **THEN** API는 대상 Profile의 `private` projection을 `null`로 반환해 기본 Post Visibility를 노출하지 않는다

### Requirement: Selected Local Owner Profile representation update

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `PROD-490`, `PROD-492` — Profile edit 저장은 GraphQL usingProfile 경계를 통과한 selected Active/Normal Local Profile과 Owner Membership을 대상으로 displayName, bio, `followPolicy`와 avatar/header Media 관계를 변경해야 한다(MUST). 임의 Profile id, Member 또는 Admin role로 편집을 허용해서는 안 된다(MUST NOT).

#### Scenario: Update selected Local Profile as Owner

- **WHEN** Active Account의 selected Profile이 Active/Normal Local이고 Membership Role이 Owner이며 유효한
  displayName, bio, `followPolicy`와 Media 관계로 수정을 요청한다
- **THEN** 시스템은 selected Profile의 표현 값, `followPolicy`와 avatar/header 관계를 원자적으로 변경한다
- **AND** payload는 갱신된 Profile을 반환해 Relay normalized record를 동기화할 수 있게 한다

#### Scenario: Validate authorization when the update starts

- **WHEN** 저장 action을 시작할 때 selected Profile·Owner Membership·Account·Local Profile eligibility 중 하나가
  유효하지 않다
- **THEN** 시스템은 현재 상태를 server-authoritative하게 확인해 수정을 거부한다
- **AND** displayName, bio, `followPolicy`와 avatar/header 관계를 모두 저장 전 상태로 유지한다

#### Scenario: Apply a later eligibility change to subsequent updates

- **WHEN** 저장 action이 eligibility 확인을 통과한 뒤 commit 전에 Profile lifecycle/suspension, Owner Membership
  또는 Account active 상태가 바뀐다
- **THEN** 이미 승인된 실행 중 요청은 별도 lock 없이 완료될 수 있다
- **AND** 상태 변경 뒤 시작한 요청은 현재 eligibility로 거부한다

### Requirement: Profile viewer Account membership projection

**Authority / Provenance:** `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0023-profile-viewer-membership-edit-eligibility.md`, `docs/design/profile-edit.md`, `PROD-705` — `Profile.viewerState.membership`은 현재 session Account와 조회 중인 Profile 사이의 실제 nullable `AccountProfile` 관계를 반환해야 한다(MUST).

Projection은 현재 session Account로 scope되어야 하고(MUST), 다른 Account의 Membership 또는 role을 노출해서는
안 된다(MUST NOT). 실제 관계의 role은 `OWNER` 또는 `MEMBER`여야 하며(MUST), 별도 `canEdit` capability로
변환해서는 안 된다(MUST NOT).

#### Scenario: Return the current Account membership

- **WHEN** 유효한 viewer Profile이 있는 session의 현재 Account와 조회 중인 Profile 사이에 Membership이 있다
- **THEN** `Profile.viewerState.membership`은 해당 실제 `AccountProfile`을 반환한다
- **AND** `membership.role`은 저장된 `OWNER` 또는 `MEMBER` 값을 반환한다

#### Scenario: Hide another Account membership

- **WHEN** 현재 session Account와 조회 중인 Profile 사이에는 Membership이 없지만 다른 Account의 Membership이 있다
- **THEN** `Profile.viewerState.membership`은 `null`이다
- **AND** 다른 Account의 Membership identity 또는 role을 응답에 노출하지 않는다

#### Scenario: Keep the viewer boundary guest-safe

- **WHEN** guest 또는 유효한 viewer Profile이 없는 session이 공개 Profile을 조회한다
- **THEN** API는 GraphQL authorization error 없이 기존 nullable `Profile.viewerState` 경계를 유지한다
- **AND** Membership projection을 권한이 있는 것처럼 합성하지 않는다

#### Scenario: Batch Memberships within the current Account

- **WHEN** 한 요청이 여러 Profile의 `viewerState.membership`을 조회한다
- **THEN** 시스템은 현재 session Account로 scope된 batch 경계에서 Membership을 조회한다
- **AND** Profile마다 개별 Membership query를 실행하지 않는다

#### Scenario: Preserve existing viewer follow state

- **WHEN** 클라이언트가 Membership과 기존 viewer-relative follow 상태를 함께 조회한다
- **THEN** `viewerState.isSelf`, `viewerState.follow`과 `viewerState.followRequest`는 기존 viewer Profile 관계를
  그대로 반환한다
- **AND** Membership projection은 FollowButton의 self·established follow·pending request 동작을 변경하지 않는다

### Requirement: Profile edit Follow Approval Policy shares the representation save boundary

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492`, `PROD-531` — 현재 Settings 진입점이 제공되기 전 Profile edit의 Follow Approval Policy 변경은 `followPolicy` enum을 displayName·bio·avatar/header와 같은 저장 동작에 포함해야 하며(MUST). 정책 변경은 기존 Pending Follow Request의 상태나 존재를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Save the policy with the selected Profile representation

- **WHEN** Owner가 `followPolicy`를 `OPEN` 또는 `APPROVAL_REQUIRED`로 변경해 Profile edit draft를 저장한다
- **THEN** 시스템은 해당 enum과 displayName·bio·avatar/header 관계를 하나의 저장 경계에서 반영한다
- **AND** 정책만 별도 즉시 저장하거나 별도 mutation seam을 실행하지 않는다

#### Scenario: Preserve Pending Follow Requests after a policy change

- **WHEN** selected Local Profile Owner가 Follow Approval Policy를 변경해 저장한다
- **THEN** 기존 Pending Follow Request의 상태와 존재는 저장 전과 동일하게 유지된다
- **AND** 정책 변경은 이미 생성된 Follow Request를 승인·거절·삭제하지 않는다

#### Scenario: Reject a non-owner or arbitrary target

- **WHEN** 요청이 selected Profile이 아닌 id를 대상으로 하거나 selected Membership이 Member·없음·Admin이다
- **THEN** 시스템은 Profile 수정을 거부한다
- **AND** displayName, bio와 Media 관계를 변경하지 않는다

#### Scenario: Reject ineligible selected Profile

- **WHEN** selected Profile이 Remote이거나 Active/Normal 조건을 통과하지 않는다
- **THEN** 시스템은 Profile 수정을 거부한다
- **AND** client용 Owner capability는 편집 가능 상태를 반환하지 않는다

### Requirement: Profile edit text and Media relationship validation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`, `PROD-490`, `PROD-492` — 새로 입력하거나 변경한 displayName은 Unicode code point 기준 1~40, bio는 앞뒤 공백을 제거한 뒤 500자 이하여야 한다(MUST). 기존 displayName이 40 code point를 초과하면 원문을 변경하지 않고 다른 field만 수정하는 요청은 legacy 호환을 위해 허용해야 한다(MUST). avatar/header는 대상 Profile이 소유한 Ready Local Media만 연결해야 한다(MUST). 관계 교체·제거는 Media 자체를 삭제해서는 안 된다(MUST NOT).

#### Scenario: Reject invalid text without partial update

- **WHEN** displayName이 비어 있거나 새로 입력·변경한 displayName이 Unicode code point 40을 초과하거나 앞뒤 공백을 제거한 bio가 500자를 초과한다
- **THEN** 시스템은 field validation 오류로 전체 수정을 거부한다
- **AND** 기존 text와 Media 관계를 유지한다

#### Scenario: Preserve an unchanged legacy displayName while updating another field

- **WHEN** 대상 Profile의 기존 displayName이 40 code point를 초과하고 Owner가 displayName 원문은 그대로 둔 채 다른 Profile field를 변경한다
- **THEN** 시스템은 해당 legacy displayName만을 이유로 전체 수정을 거부하지 않는다
- **AND** displayName 원문을 한 글자라도 변경하면 새로 입력·변경한 값에 Unicode code point 기준 1~40 validation을 적용한다
- **AND** 서버는 client가 unchanged displayName을 생략하는 것에 의존하지 않고 저장 원문과 요청 원문을 비교한다

#### Scenario: Replace or remove Ready Local Media relationships

- **WHEN** Owner가 대상 Profile의 Ready Local Media를 avatar/header로 선택하거나 기존 관계를 제거한다
- **THEN** 시스템은 Profile representation 관계만 교체하거나 제거한다
- **AND** 이전 Media와 새 Media row/blob을 삭제하지 않는다

#### Scenario: Distinguish omitted, replacement and removal input

- **WHEN** avatar/header update field를 생략하거나 concrete Media global ID 또는 `null`로 보낸다
- **THEN** 시스템은 각 field를 각각 관계 유지, 해당 Media로 교체, 해당 kind 관계 제거로 해석한다
- **AND** 한 field의 input 의미가 다른 field 관계를 변경하지 않는다

#### Scenario: Reject invalid Media relationship atomically

- **WHEN** 선택한 Media가 다른 Profile 소유, Remote, Ready가 아니거나 존재하지 않는다
- **THEN** 시스템은 전체 수정을 거부한다
- **AND** displayName, bio와 기존 avatar/header 관계를 모두 유지한다
- **AND** 요청한 avatar와 header를 모두 검증하기 전에 어떤 text·policy·관계 write도 확정하지 않는다

### Requirement: Viewer-authorized Profile avatar and header projection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/design/profile-edit.md`, `PROD-492`, `PROD-581` — Profile의 avatar/header 관계는 해당 Profile 조회 정책을 통과한 viewer에게 연결된 Ready Media identity와 저장된 URL을 제공해야 한다(MUST). 이 범위에서 media type GraphQL field를 추가하거나 일반 Media Node의 owner-only 조회 정책을 공개로 넓혀서는 안 되며(MUST NOT), update payload와 Profile query는 Relay가 동일 Media record를 정규화할 수 있는 identity를 제공해야 한다(MUST).

#### Scenario: Display linked images on a public Profile

- **WHEN** guest 또는 다른 Account가 조회 정책을 통과하는 Profile을 조회하고 Ready avatar/header 관계가 있다
- **THEN** Profile은 각 관계의 Media identity와 표시 URL metadata를 반환한다
- **AND** ProfileHero는 fallback 대신 해당 avatar/header를 표시할 수 있다

#### Scenario: Do not widen standalone Media visibility

- **WHEN** viewer가 Profile 관계가 아닌 일반 Media Node lookup으로 연결되지 않은 Ready Local Media를 조회한다
- **THEN** 기존 owner-only Media 조회 정책을 유지한다
