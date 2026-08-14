## Context

이 기록은 PROD-769의 Reaction GraphQL-only RLS, viewer-independent aggregate, selected Profile add/delete ownership, hidden/deleted Post owner cleanup, `DELETE ... RETURNING` payload·Notification cleanup과 trusted workload 경계를 구현 가능한 선택으로 구체화한다.

## Decision Records

### Reaction RLS policy는 kosmo_api에만 적용한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-769, PROD-767
- Status: Active
- Context / Problem: GraphQL Reaction 행 권한을 database에서 강제하면서 trusted Worker/Fedify/Temporal caller를 같은 policy로 제한하면 독립 실행 경계가 섞인다.
- Decision Outcome: `reaction`은 RLS를 활성화하고 FORCE RLS는 비활성화하며 모든 policy role을 `kosmo_api`로 한정한다. owner와 `kosmo_worker` BYPASSRLS를 유지하고 Worker policy를 만들지 않는다.
- Alternatives Considered: `PUBLIC` 또는 Worker 전용 permissive policy는 GraphQL-only 범위를 넓히고 기존 BYPASSRLS 경계를 중복한다.
- Consequences: migration은 owner runtime에 additive하게 배포할 수 있지만 실제 GraphQL 전역 principal cutover는 PROD-767/716 완료 뒤 별도 책임이다.
- Confirmation / Follow-up: catalog role/mode와 disposable owner/Worker 결과를 검증하고 다른 table policy가 diff에 없는지 확인한다.

### 조회 가능한 Target Post의 모든 Reaction을 SELECT한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, PROD-769
- Status: Active
- Context / Problem: Reaction SELECT를 selected Profile owner로 제한하면 `reactionCounts`가 viewer마다 달라지고 `reactionProfiles`도 다른 actor의 행을 잃는다.
- Decision Outcome: `kosmo_api`는 현재 Target Post를 조회할 수 있을 때 그 Post의 모든 Reaction을 SELECT한다. count는 actor/Profile visibility와 무관하게 집계하고, Profile 목록과 viewer 관계는 기존 application predicate로 각각 Profile visibility와 selected Profile ownership을 계속 제한한다.
- Alternatives Considered: owner-only SELECT는 aggregate 계약을 깨뜨린다. Reaction Profile visibility를 policy에 합치면 count와 Profile 목록의 서로 다른 책임을 분리할 수 없다.
- Consequences: Reaction policy는 Post RLS 결과에 의존하고 Post policy 변화가 Target Post branch에 반영된다.
- Confirmation / Follow-up: anonymous/authenticated viewer count 일치, hidden Post 비노출, Profile visibility 및 viewer Profile 격리를 GraphQL integration에서 검증한다.

### owner SELECT branch로 hidden/deleted DELETE RETURNING을 유지한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, PROD-769
- Status: Active
- Context / Problem: PostgreSQL RLS에서 `DELETE ... RETURNING`은 DELETE policy와 SELECT 가시성을 모두 요구한다. Target Post visibility만 SELECT에 사용하면 Post가 hidden/deleted가 된 뒤 owner cleanup이 row와 payload를 잃는다.
- Decision Outcome: current Profile actor가 `reaction.profile_id`와 일치하는 owner row에는 Target Post 상태와 무관한 permissive SELECT branch를 둔다. 별도 owner DELETE policy와 결합해 기존 direct `DELETE ... RETURNING`, payload Reaction ID와 post-commit Notification cleanup을 유지한다. Reaction GraphQL Node의 Target Post join과 application predicate는 유지해 내부 owner SELECT가 hidden/deleted GraphQL 노출로 이어지지 않게 한다.
- Alternatives Considered: DELETE policy만 분리하는 방식은 SELECT 가시성 요구를 해결하지 못한다. privileged delete function은 SECURITY DEFINER ownership, EXECUTE ACL과 search path라는 새 보안 경계를 추가한다. Target Post visibility를 owner cleanup보다 우선하면 승인된 delete 계약을 깨뜨린다.
- Consequences: `kosmo_api` SQL 수준에서 selected Profile owner는 hidden/deleted Post의 자기 Reaction row를 볼 수 있다. 이 가시성은 owner cleanup compatibility를 위한 최소 내부 권한이며 GraphQL Node/relation의 Target Post 경계는 application query 구조와 Post RLS가 별도로 유지한다.
- Confirmation / Follow-up: direct role matrix에서 owner/non-owner hidden/deleted SELECT·DELETE를 확인하고 GraphQL Node null, delete payload ID와 Notification cleanup을 함께 검증한다.

### INSERT와 DELETE는 current Profile actor 소유권을 fail-closed로 강제한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/reaction.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-769
- Status: Active
- Context / Problem: broad transition DML policy나 Account membership 전체를 actor로 인정하면 selected Profile이 아닌 다른 Profile의 Reaction을 생성·삭제할 수 있다.
- Decision Outcome: INSERT는 current Profile actor와 `profile_id`가 같고 Target Post가 현재 조회 가능한 경우만 허용한다. DELETE는 current Profile actor와 `profile_id`가 같은 행만 허용한다. missing, empty, malformed actor helper 결과는 NULL로 fail-closed 한다. 제품의 실제 Reaction UPDATE는 허용하지 않으며, 기존 Notification row lock 호환을 위한 제한된 policy는 별도 결정에 따른다.
- Alternatives Considered: permissive `FOR ALL`은 Reaction ownership을 보존하지 못한다. Account membership 전체 actor는 selected Profile authorization boundary를 넓힌다. DELETE에 Target Post visibility까지 요구하면 owner cleanup을 깨뜨린다.
- Consequences: add는 기존 Target Post 조회와 같은 policy 결과를 사용하고 delete는 Post 상태와 독립된 owner action으로 유지된다.
- Confirmation / Follow-up: owner/non-owner, visible/hidden/deleted Post와 invalid actor INSERT/DELETE matrix를 실제 `kosmo_api` role에서 검증한다.

### 기존 Notification row lock은 임시 owner policy로 보존하고 제거는 후속으로 미룬다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-769, `memory/database-design.md`, `packages/core/services/notification.ts`
- Status: Active
- Context / Problem: Reaction RLS에 UPDATE policy가 없으면 기존 Notification source의 `SELECT FOR UPDATE`가 PostgreSQL UPDATE policy를 통과하지 못해 Reaction Notification이 생성되지 않는다. Reaction 같은 social interaction에서 명시적 row lock을 계속 사용하는 것은 장기 locking policy와 맞지 않지만, 이번 RLS 변경에서 lock 제거까지 함께 수행하면 Notification 동시성 의미를 재설계하는 별도 범위가 된다.
- Decision Outcome: PROD-769는 current Profile owner 행에만 `FOR UPDATE USING`을 허용하는 임시 `kosmo_api` UPDATE policy를 둔다. `WITH CHECK (false)`로 실제 Reaction UPDATE는 모두 거부한다. advisory lock을 새로 도입하지 않으며, 기존 row lock 제거는 후속 범위로 미룬다.
- Alternatives Considered: UPDATE policy를 생략하면 기존 Notification 생성·cleanup이 깨진다. advisory lock 치환은 기존 row lock 제거가 아니라 다른 명시적 lock으로의 재설계이며 사용자가 취소했다. 이번 change에서 row lock을 제거하는 방안은 바람직한 최종 방향이지만 별도 동시성 검증이 필요해 후속으로 미뤘다.
- Consequences: `kosmo_api` owner Notification 경로의 기존 row lock은 보존되지만, 제품에 없던 Reaction 수정 권한은 생기지 않는다. 임시 policy는 row lock 제거 후 함께 삭제해야 한다.
- Confirmation / Follow-up: 실제 `kosmo_api` Notification regression으로 `SELECT FOR UPDATE` 성공을 확인하고 direct UPDATE가 RLS로 거부되는지 검증한다. 후속 변경은 lock과 임시 policy를 함께 제거해야 한다.

### 기존 Reaction GraphQL integration을 실제 kosmo_api operation principal로 실행한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-769, `memory/database-migrations.md`, `memory/script.md`
- Status: Active
- Context / Problem: owner credential로 실행한 GraphQL regression은 RLS policy가 실제 resolver/core SQL에서 적용되는지 증명하지 못한다. 반면 migration 파일별 behavior test는 제품 observable contract와 중복되고 명시적으로 제외됐다.
- Decision Outcome: disposable test database의 owner login에 PostgreSQL startup `role=kosmo_api`를 적용한 operation URL로 기존 Reaction GraphQL integration을 실행한다. fixture setup과 결과 inspection은 owner handle을 유지한다. current principal assertion과 DELETED cleanup을 보강하고, representative `kosmo_worker` connection으로 BYPASSRLS를 확인한다. migration은 기존 generic replay/snapshot chain으로 검증한다.
- Alternatives Considered: owner integration과 별도 migration filename test 조합은 실제 GraphQL RLS wiring을 증명하지 못하고 금지된 test shape를 되살린다. production credential 검증은 승인 경계를 침범한다.
- Consequences: Reaction integration이 다른 table ACL/RLS의 실제 미분류 dependency를 드러낼 수 있으며, 그 경우 범위 외 policy로 우회하지 않고 blocker를 분류한다.
- Confirmation / Follow-up: test output에 `current_user = kosmo_api`, 기존 Reaction GraphQL matrix와 worker bypass 결과를 남긴다.

### PR 완료와 production 운영을 분리한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: PROD-769, PROD-767
- Status: Active
- Context / Problem: migration PR, CI와 OpenSpec completion이 실제 production principal cutover나 live behavior 증거로 과장될 수 있다.
- Decision Outcome: 이 change는 additive migration, disposable role-level 검증, GraphQL/core regression과 Ready PR까지만 소유한다. production preflight, sync/apply, principal cutover와 live 검증은 별도 명시 승인 전 수행하지 않는다.
- Alternatives Considered: PR 완료와 production cutover를 한 gate로 합치면 독립 승인·rollback·운영 책임을 잃는다.
- Consequences: Ready PR은 production에 적용되지 않은 구현 증거로만 보고하며 PROD-767/716의 전체 coverage/cutover를 완료 처리하지 않는다.
- Confirmation / Follow-up: PR 본문과 최종 보고에 code/CI, 비운영 role matrix, production 미수행 상태를 분리한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- OpenSpec 초안의 “Reaction UPDATE policy를 만들지 않는다”는 가정은 실제 Notification source query가 `SELECT FOR UPDATE`를 사용한다는 통합 테스트 증거로 대체됐다. 실제 UPDATE 금지는 유지하되 임시 owner lock policy를 둔다.
- 검토 중 제안된 advisory lock 치환은 사용자가 취소했다. PROD-769는 기존 row lock을 보존하고 제거를 후속으로 미룬다.
