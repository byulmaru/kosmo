## ADDED Requirements

### Requirement: Profile handle partial search

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md` (ADR 0017), `PROD-504` — 시스템은 기존 exact handle 조회 계약을 유지하면서, 입력 handle을 기존 정책으로 정규화한 뒤 DB에 저장된 Local/Remote Profile의 정규화 handle을 SQL `LIKE`로 부분 일치 조회하는 다건 GraphQL API를 제공해야 한다(MUST). 현재 단계의 API는 일치 결과 전체를 pagination 없이 반환해야 하며(MUST), 최대 개수와 별도 정렬 순서를 계약하지 않아야 한다(MUST NOT). exact `profileByHandle`과 partial `profilesByHandle`은 모두 configured local Instance의 `ProfileState.ACTIVE` Profile과, 입력 domain의 ActivityPub Instance에 저장된 `ProfileState.ACTIVE` Remote Profile 중 `InstanceState.SUSPENDED`가 아닌 Instance의 Profile만 반환하는 ADR 0017 staged visibility를 사용해야 한다(MUST). 검색은 기존 local/remote handle 해석 경계를 계승해야 하며(MUST), 새로운 visibility 정책이나 데이터 모델을 추가하거나 Domain Limit·viewer Profile Domain Block 공통 predicate를 현재 구현의 선행 조건으로 요구하지 않아야 한다(MUST NOT). 최종 moderation 정책은 유지되며, 해당 두 정책은 저장 모델과 공통 predicate가 도입될 때 exact·partial lookup을 함께 전환하는 후속 rollout으로 남는다.

#### Scenario: Search configured local profiles by partial handle

- **WHEN** 클라이언트가 bare handle 일부 또는 configured local domain이 붙은 handle 일부로 검색한다
- **THEN** 시스템은 입력 handle을 기존 정책으로 정규화한다
- **AND** configured local instance에 저장된 `ProfileState.ACTIVE` Profile 중 정규화 handle이 입력 문자열을 포함하는 결과 전체를 반환한다

#### Scenario: Search stored remote profiles by partial federated handle

- **WHEN** 클라이언트가 configured local domain이 아닌 `handle-part@domain` 또는 `@handle-part@domain` 형식으로 검색한다
- **THEN** 시스템은 handle 일부와 domain을 기존 정책으로 정규화한다
- **AND** 해당 domain의 ActivityPub instance에 이미 저장된 `ProfileState.ACTIVE` Remote Profile 중 정규화 handle이 입력 문자열을 포함하는 결과 전체를 반환한다
- **AND** `InstanceState.SUSPENDED`가 아닌 remote Instance의 Profile만 반환한다
- **AND** 검색은 WebFinger, actor document fetch·refresh 또는 새 Remote Profile materialization을 수행하지 않는다
- **AND** Domain Limit Instance 및 viewer Profile Domain Block 대상 Instance 필터는 ADR 0017에 따른 미래 공통-predicate moderation rollout로 남으며 현재 검색의 선행 조건이 아니다

#### Scenario: Treat LIKE metacharacters as literal search text

- **WHEN** 검색어에 `%`, `_` 또는 SQL `LIKE` escape 문자가 포함된다
- **THEN** 시스템은 사용자 입력 메타문자를 먼저 escape하여 일반 검색 문자로 취급한다
- **AND** escape된 정규화 검색어의 양쪽에만 부분 일치용 `%`를 추가한다
- **AND** 완성된 검색 패턴은 SQL 문자열에 직접 보간하지 않고 parameter binding으로 전달한다
- **AND** 사용자 입력은 의도하지 않은 전체 또는 wildcard 패턴 검색을 만들지 않는다

#### Scenario: Return all partial matches without pagination

- **WHEN** 조회 정책을 통과한 Profile 여러 개의 정규화 handle이 검색어와 부분 일치한다
- **THEN** 시스템은 현재 단계에서 cursor, page argument 또는 최대 결과 개수 없이 일치 결과 전체를 반환한다
- **AND** 클라이언트는 반환 순서에 별도 제품 의미가 있다고 가정하지 않는다

#### Scenario: Keep exact handle lookup compatible

- **WHEN** 프로필 route 또는 기존 소비자가 exact `profileByHandle` 조회를 사용한다
- **THEN** 시스템은 기존 단건 exact lookup의 입력·출력 계약을 유지한다

#### Scenario: Do not materialize remote profiles during search

- **WHEN** 저장된 remote Profile 중 부분 일치 결과가 없거나 입력 domain의 저장된 Instance가 없다
- **THEN** 시스템은 빈 결과 목록을 반환한다
- **AND** WebFinger lookup, actor document fetch, actor refresh 또는 remote Profile 저장을 수행하지 않는다
