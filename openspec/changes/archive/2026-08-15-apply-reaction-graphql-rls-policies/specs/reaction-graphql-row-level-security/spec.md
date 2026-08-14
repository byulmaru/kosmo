## ADDED Requirements

### Requirement: GraphQL Reaction RLS 경계

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-769. `reaction` table은 MUST RLS를 활성화하고 FORCE RLS는 MUST NOT 활성화해야 한다. Reaction policy는 MUST `kosmo_api`에만 적용해야 하며 owner와 `kosmo_worker` BYPASSRLS 경로를 MUST NOT 변경한다.

#### Scenario: GraphQL principal policy scope

- **WHEN** migration이 정확한 비운영 revision에 적용된다
- **THEN** `reaction`은 RLS enabled, FORCE disabled이고 모든 Reaction policy role은 `kosmo_api`다
- **AND** `kosmo_worker`용 Reaction policy나 다른 table policy를 만들지 않는다

#### Scenario: trusted workload 무회귀

- **WHEN** owner 또는 `kosmo_worker`가 같은 Reaction 행에 접근한다
- **THEN** 기존 BYPASSRLS 결과를 유지한다

### Requirement: Reaction 조회와 viewer-independent aggregate

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, PROD-769. `kosmo_api`는 MUST 조회 가능한 Target Post의 현재 Reaction 행을 actor와 무관하게 SELECT할 수 있어야 한다. GraphQL Node와 Post relation은 MUST Target Post 조회 정책을 유지해야 하며, `reactionCounts`는 MUST 조회 가능한 같은 Post의 모든 Reaction을 포함해 viewer 사이에서 달라지지 않아야 한다. `reactionProfiles`는 MUST 별도 Profile visibility predicate를 계속 적용하고 `viewerReactions`는 MUST 현재 selected Profile의 관계만 반환해야 한다.

#### Scenario: viewer-independent count

- **WHEN** 둘 이상의 viewer가 같은 조회 가능한 Post의 Reaction count를 요청한다
- **THEN** 모든 현재 Reaction은 작성 Profile visibility나 selected Profile과 무관하게 count에 포함된다
- **AND** 두 viewer는 같은 Type별 count를 받는다

#### Scenario: Node와 relation의 Target Post 경계

- **WHEN** viewer가 조회할 수 없는 Post의 Reaction Node, Profile relation, viewer relation 또는 count를 요청한다
- **THEN** GraphQL은 Reaction 데이터를 노출하지 않는다

#### Scenario: Profile 목록과 selected Profile 관계

- **WHEN** viewer가 조회 가능한 Post의 Reaction Profile 목록과 viewer Reaction을 요청한다
- **THEN** Profile 목록은 기존 Profile visibility를 통과한 Profile만 포함한다
- **AND** viewer Reaction은 현재 selected Profile이 소유한 행만 포함한다

### Requirement: selected Profile Reaction 추가

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-769. `kosmo_api` INSERT는 MUST current Profile actor가 자기 `profile_id`로 조회 가능한 Active Post에 Reaction을 추가하는 경우만 허용해야 한다. missing, empty 또는 malformed Profile actor context와 다른 Profile 소유권은 MUST fail-closed 되어야 한다.

#### Scenario: 조회 가능한 Post에 owner INSERT

- **WHEN** selected Profile이 조회 가능한 Active Post에 자기 Profile ID로 Reaction을 추가한다
- **THEN** INSERT와 기존 멱등 add payload가 성공한다

#### Scenario: 다른 Profile 또는 조회 불가 Post INSERT

- **WHEN** `kosmo_api`가 다른 Profile ID, 조회할 수 없는 Post 또는 유효하지 않은 actor context로 Reaction을 추가한다
- **THEN** database policy가 INSERT를 거부한다

### Requirement: hidden 또는 deleted Target Post의 owner cleanup

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, PROD-769. `kosmo_api` DELETE는 MUST current Profile actor가 소유한 현재 Post/Type Reaction만 제거해야 한다. Target Post가 생성 뒤 hidden 또는 deleted 상태가 되어도 owner cleanup은 MUST `DELETE ... RETURNING`으로 실제 삭제된 Reaction 행을 반환해야 하며, GraphQL payload는 MUST 그 Reaction ID를 반환하고 기존 post-commit Notification cleanup을 실행해야 한다. 다른 Profile, missing actor와 malformed actor는 MUST 해당 행을 삭제하지 못해야 한다.

#### Scenario: hidden Target Post owner delete

- **WHEN** selected Profile이 자기 Reaction을 생성한 뒤 Target Post를 더 이상 조회할 수 없게 된다
- **THEN** Post/Type delete는 실제 Reaction을 제거하고 `reactionId`를 반환한다
- **AND** payload의 Post는 기존 Target Post 조회 정책에 따라 nullable 결과를 유지한다
- **AND** 실제 삭제된 Reaction의 Notification cleanup이 실행된다

#### Scenario: deleted Target Post owner delete

- **WHEN** Target Post가 DELETED 상태가 된 뒤 selected Profile이 자기 Reaction을 Post/Type으로 삭제한다
- **THEN** Reaction은 제거되고 `DELETE ... RETURNING` 결과와 Notification cleanup을 유지한다

#### Scenario: non-owner와 invalid actor delete

- **WHEN** 다른 Profile 또는 missing, empty, malformed actor context가 같은 Post/Type을 삭제한다
- **THEN** 다른 Profile의 Reaction과 Notification은 유지된다
- **AND** GraphQL은 기존 no-op payload를 유지한다

### Requirement: 기존 Notification row lock 호환과 실제 UPDATE 금지

**Authority / Provenance:** PROD-769, `memory/database-design.md`. 기존 Reaction Notification source query가 owner Reaction을 `SELECT FOR UPDATE`하는 동안 `kosmo_api`는 MUST 해당 owner row lock 조회를 계속 수행할 수 있어야 한다. 이 호환 policy는 MUST 실제 Reaction UPDATE를 허용하지 않아야 하며 advisory lock을 MUST NOT 새로 도입해야 한다. 기존 Reaction row lock 제거와 임시 policy 삭제는 MUST 이 change의 완료 조건이 아닌 후속 범위로 유지해야 한다.

#### Scenario: owner Notification row lock

- **WHEN** current Profile actor의 Reaction으로 Notification을 생성하며 source query가 `SELECT FOR UPDATE`를 수행한다
- **THEN** `kosmo_api`는 owner Reaction을 조회하고 기존 Notification을 생성한다

#### Scenario: 실제 Reaction UPDATE 거부

- **WHEN** `kosmo_api`가 owner Reaction의 type 또는 다른 저장 값을 UPDATE하려 한다
- **THEN** database policy가 실제 행 변경을 거부한다
- **AND** 이 change는 advisory lock을 추가하지 않는다

### Requirement: 검증과 운영 승인 분리

**Authority / Provenance:** PROD-769. 구현은 MUST 기존 GraphQL/core integration과 정확한 disposable non-production `kosmo_api` role에서 Node/relation/viewer/count/add/delete/cleanup matrix를 검증해야 한다. 검증은 MUST 파일별 migration behavior test를 추가하지 않고 관찰 가능한 GraphQL 권한 계약과 generic migration chain을 사용해야 한다. PR, CI와 OpenSpec 완료는 MUST production preflight, sync/apply, principal cutover 또는 live 검증 승인으로 해석되지 않아야 한다.

#### Scenario: 비운영 완료 증거

- **WHEN** PROD-769 구현을 Ready PR로 전환한다
- **THEN** generic migration replay와 GraphQL/core regression 및 disposable `kosmo_api` role matrix가 통과한다
- **AND** production mutation이나 live 검증은 수행하지 않는다
