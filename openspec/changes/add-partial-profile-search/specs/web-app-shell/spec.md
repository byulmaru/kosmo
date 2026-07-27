## RENAMED Requirements

- FROM: `### Requirement: People tab exact handle search results`
- TO: `### Requirement: People tab partial handle search results`

## MODIFIED Requirements

### Requirement: People tab partial handle search results

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md` (ADR 0017), `PROD-504` — 검색 후 사람 탭은 제출된 검색어(`q`)를 기존 정책으로 정규화한 handle 부분 검색어로 해석하고, DB에 저장된 Local/Remote Profile의 부분 일치 결과 전체를 목록으로 표시해야 한다(MUST). 사람 탭이 아니거나 제출된 검색어가 비어 있으면 handle 검색을 실행하지 않아야 한다(MUST NOT). 각 검색 결과는 실데이터와 팔로우 액션이 연결된 `ProfileListItem`으로 표시해야 한다(MUST). 검색 결과 항목은 해당 프로필의 `relativeHandle`을 path로 사용한 프로필 페이지(`/${relativeHandle}`)로 이동할 수 있어야 한다(MUST). display name, 게시글·미디어 또는 원격 fediverse 조회 검색은 이 범위에서 제공하지 않는다(MUST NOT). 현재 staged visibility는 configured local Instance의 `ProfileState.ACTIVE` Profile과 remote domain의 `ProfileState.ACTIVE` Profile 중 `InstanceState.SUSPENDED`가 아닌 Instance에 이미 저장된 Profile만 포함한다. WebFinger, actor document fetch·refresh 또는 새 Remote Profile materialization은 수행하지 않으며, Domain Limit·viewer Profile Domain Block 공통 predicate는 ADR 0017에 따른 미래 동시 moderation rollout이지 현재 검색의 선행 조건이 아니다.

#### Scenario: Multiple partial handle results

- **WHEN** 사용자가 여러 저장된 Profile의 handle에 포함된 문자열을 사람 탭에서 검색한다
- **THEN** 시스템은 부분 일치하는 결과 전체를 pagination 없이 각각 `ProfileListItem`으로 표시한다
- **AND** 각 결과 항목의 프로필 정보 영역은 `/${relativeHandle}` 프로필 페이지로 이동한다
- **AND** 각 결과 항목의 팔로우 액션은 local Profile 또는 ActivityPub remote Profile 여부와 관계없이 기존 `ProfileListItem`/`FollowButton` 정책에 따라 표시되거나 숨겨진다

#### Scenario: Local-domain partial handle results

- **WHEN** 사용자가 configured local domain의 `handle-part@domain` 또는 `@handle-part@domain` 형식으로 사람 탭에서 검색한다
- **THEN** 시스템은 이를 remote Profile 검색으로 취급하지 않고 configured local instance의 handle 부분 일치 검색으로 정규화한다
- **AND** 각 결과 Profile의 `relativeHandle`은 `@handle` 형식으로 유지된다
- **AND** 결과는 configured local Instance에 이미 저장된 `ProfileState.ACTIVE` Profile로 한정된다

#### Scenario: Stored remote partial handle results

- **WHEN** 사용자가 remote domain의 `handle-part@domain` 또는 `@handle-part@domain` 형식으로 사람 탭에서 검색한다
- **THEN** 시스템은 해당 domain에 이미 materialized되어 DB에 저장된 ActivityPub remote Profile의 부분 일치 결과만 표시한다
- **AND** 각 결과 Profile의 `relativeHandle`은 `@handle@domain` 형식이다
- **AND** 결과는 `ProfileState.ACTIVE`이고 `InstanceState.SUSPENDED`가 아닌 remote Instance에 이미 저장된 Profile로 한정된다
- **AND** 검색 중 WebFinger lookup, actor document fetch, actor refresh 또는 remote Profile 저장을 수행하지 않는다

#### Scenario: Literal LIKE metacharacter search

- **WHEN** 사용자가 `%`, `_` 또는 SQL `LIKE` escape 문자가 포함된 검색어를 제출한다
- **THEN** 시스템은 해당 문자를 wildcard가 아닌 일반 검색 문자로 취급한 결과만 표시한다
- **AND** 의도하지 않은 전체 또는 wildcard 패턴 결과를 표시하지 않는다

#### Scenario: Missing partial handle results

- **WHEN** 사용자가 저장된 Profile의 handle과 부분 일치하지 않는 검색어를 사람 탭에서 검색한다
- **THEN** 시스템은 결과 없음 안내를 표시한다

#### Scenario: Skip search without people query

- **WHEN** 사람 탭이 아니거나 제출된 검색어가 비어 있다
- **THEN** 시스템은 부분 일치 handle 조회를 실행하지 않는다
