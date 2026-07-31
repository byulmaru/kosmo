## MODIFIED Requirements

### Requirement: People tab partial handle search results

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md` (ADR 0017), `PROD-504`, `PROD-573`. 시스템은 이 검색 UI 계약을 준수해야 한다(MUST).
검색 후 사람 탭은 제출된 검색어(`q`)를 기존 정책으로 정규화한 handle 검색어로 해석하고
`searchProfiles` connection을 목록으로 표시해야 한다(MUST). 일반·부분 handle 검색은 DB에 저장된 Local/Remote
Profile만 표시해야 하며(MUST), 인증된 사용자가 명시적인 `@handle@instance` 전체를 제출한 경우에는 서버가
기존 actor materialization 경계로 저장한 Remote Profile도 같은 connection 결과로 표시해야 한다(MUST). 다음
페이지가 있으면 Relay pagination으로 결과를 누적하고 loading/error/retry와 종료 상태를 제공해야 한다(MUST).
사람 탭이 아니거나 검색어가 비어 있으면 handle 검색을 실행해서는 안 된다(MUST NOT). 각 검색 결과는 실데이터와
팔로우 액션이 연결된 `ProfileListItem`으로 표시하고 `/${relativeHandle}` 프로필 페이지로 이동할 수 있어야 한다
(MUST). 클라이언트와 프로필 route는 WebFinger, actor document fetch·refresh 또는 새 Remote Profile
materialization을 직접 시작해서는 안 된다(MUST NOT). GraphQL schema, Relay connection shape, staged visibility와
Domain Limit·viewer Profile Domain Block의 미래 공통-predicate rollout은 유지해야 한다(MUST).

#### Scenario: Multiple partial handle results

- **WHEN** 사용자가 여러 저장된 Profile의 handle에 포함된 문자열을 사람 탭에서 검색한다
- **THEN** 시스템은 첫 connection page의 부분 일치 결과를 각각 `ProfileListItem`으로 표시한다
- **AND** 각 결과 항목의 프로필 정보 영역은 `/${relativeHandle}` 프로필 페이지로 이동한다
- **AND** 각 결과 항목의 팔로우 액션은 local 또는 ActivityPub remote Profile 여부와 관계없이 기존 정책에 따라 표시되거나 숨겨진다

#### Scenario: Load the next page of partial handle results

- **WHEN** 현재 connection에 다음 페이지가 있고 사용자가 더 불러오기를 실행한다
- **THEN** 시스템은 `after` cursor로 다음 페이지를 요청해 기존 결과 뒤에 누적한다
- **AND** 로딩 중에는 중복 요청을 막고 다음 페이지 실패 시 기존 결과를 유지하며 같은 위치에서 재시도할 수 있다
- **AND** 페이지 사이에 Profile이 중복되거나 누락되지 않으며 마지막 페이지에서는 더 불러오기 동작을 숨긴다

#### Scenario: Local-domain partial handle results

- **WHEN** 사용자가 configured local domain의 handle 일부로 사람 탭에서 검색한다
- **THEN** 시스템은 이를 remote Profile materialization 대상으로 취급하지 않고 configured local instance의 handle 부분 일치 검색으로 정규화한다
- **AND** 각 결과 Profile의 `relativeHandle`은 `@handle` 형식으로 유지된다
- **AND** 결과는 configured local Instance에 이미 저장된 `ProfileState.ACTIVE` Profile로 한정된다

#### Scenario: Stored remote partial handle results

- **WHEN** 사용자가 명시적인 원격 qualified handle 전체가 아닌 remote domain handle 일부로 사람 탭에서 검색한다
- **THEN** 시스템은 해당 domain에 이미 저장된 ActivityPub Remote Profile의 부분 일치 결과만 표시한다
- **AND** 각 결과 Profile의 `relativeHandle`은 `@handle@domain` 형식이다
- **AND** 검색 중 WebFinger lookup, actor document fetch, actor refresh 또는 remote Profile 저장을 수행하지 않는다

#### Scenario: Show a newly materialized explicit remote account

- **WHEN** 인증된 사용자가 아직 저장되지 않은 명시적인 `@handle@instance` 전체를 사람 탭에서 검색하고 서버 materialization이 성공한다
- **THEN** 시스템은 같은 `searchProfiles` connection에서 canonical Remote Profile을 `ProfileListItem`으로 표시한다
- **AND** 결과 선택은 저장된 `relativeHandle`의 프로필 페이지로 이동한다
- **AND** 프로필 route는 선택 과정에서 추가 원격 fetch를 시작하지 않는다

#### Scenario: Show no result when explicit remote lookup fails

- **WHEN** 명시적인 원격 계정 lookup, validation, Instance availability 또는 identity 충돌 때문에 materialization 결과가 없다
- **THEN** 시스템은 검색 오류 화면 대신 기존 결과 없음 안내를 표시한다
- **AND** 검색어와 사람 탭 상태를 유지한다

#### Scenario: Literal LIKE metacharacter search

- **WHEN** 사용자가 `%`, `_` 또는 SQL `LIKE` escape 문자가 포함된 검색어를 제출한다
- **THEN** 시스템은 해당 문자를 wildcard가 아닌 일반 검색 문자로 취급한 결과만 표시한다
- **AND** 의도하지 않은 wildcard 결과나 remote materialization을 만들지 않는다

#### Scenario: Missing partial handle results

- **WHEN** 사용자가 저장된 Profile의 handle과 부분 일치하지 않는 일반·부분 검색어를 사람 탭에서 검색한다
- **THEN** 시스템은 결과 없음 안내를 표시한다

#### Scenario: Skip search without people query

- **WHEN** 사람 탭이 아니거나 제출된 검색어가 비어 있다
- **THEN** 시스템은 handle 조회와 remote actor materialization을 실행하지 않는다
