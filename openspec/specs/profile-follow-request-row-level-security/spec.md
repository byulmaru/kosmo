# profile-follow-request-row-level-security Specification

## Purpose

GraphQL `kosmo_api`가 selected Profile participant인 pending ProfileFollowRequest만 조회·생성·종료하도록 PostgreSQL RLS로 강제하면서 기존 command 방향, pending lifecycle, Notification side effect와 trusted Worker 경계를 보존하는 요구사항을 정의한다.

## Requirements

### Requirement: ProfileFollowRequest에 GraphQL principal RLS를 활성화한다

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, PROD-770. 시스템은 MUST `public.profile_follow_request`에 ROW LEVEL SECURITY를 활성화한다. FORCE ROW LEVEL SECURITY는 MUST NOT 활성화한다. 정책은 MUST `kosmo_api`에만 명시적으로 적용하고, `kosmo_worker`용 정책이나 전체 role 대상 permissive policy를 MUST NOT 만든다.

#### Scenario: GraphQL principal에 RLS가 적용됨

- **WHEN** `kosmo_api`가 ProfileFollowRequest를 조회하거나 변경한다
- **THEN** PostgreSQL은 해당 command의 `kosmo_api` policy를 적용한다

#### Scenario: owner와 Worker 경계는 우회 결과를 유지함

- **WHEN** table owner 또는 `BYPASSRLS=true`인 `kosmo_worker`가 ProfileFollowRequest SQL을 실행한다
- **THEN** FORCE RLS가 없으므로 기존 owner/Worker 결과를 유지한다
- **AND** 이 change는 role의 object ACL, membership 또는 credential을 변경하지 않는다

### Requirement: selected Profile participant만 Follow Request를 조회한다

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-770. `kosmo_api` SELECT policy는 MUST `public.kosmo_current_profile_id()`를 현재 selected Profile로 사용하고, 그 값이 `follower_profile_id` 또는 `followee_profile_id`와 같은 row만 허용한다. Account의 다른 membership Profile은 MUST selected Profile 권한으로 인정하지 않는다.

#### Scenario: follower participant가 Node와 outgoing connection을 조회함

- **WHEN** 유효한 current Profile이 Follow Request의 follower다
- **THEN** 해당 ProfileFollowRequest Node와 같은 Profile의 outgoing connection row를 조회할 수 있다

#### Scenario: followee participant가 Node와 incoming connection을 조회함

- **WHEN** 유효한 current Profile이 Follow Request의 followee다
- **THEN** 해당 ProfileFollowRequest Node와 같은 Profile의 incoming connection row를 조회할 수 있다

#### Scenario: 비participant와 다른 selected Profile이 직접 ID를 조회함

- **WHEN** current Profile이 follower도 followee도 아니거나 같은 Account의 다른 membership Profile이다
- **THEN** ProfileFollowRequest row는 반환되지 않는다
- **AND** 대상 ID를 알아도 Node 또는 connection을 통해 우회할 수 없다

#### Scenario: actor context가 없거나 malformed임

- **WHEN** Profile setting이 누락, 빈 값 또는 UUID가 아닌 값이라 actor helper가 `NULL`을 반환한다
- **THEN** SELECT는 오류를 일으키지 않고 어떤 ProfileFollowRequest row도 반환하지 않는다

### Requirement: Follow Request 생성과 종료 command에 별도 RLS 경계를 둔다

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-770. `kosmo_api` INSERT policy는 MUST 새 row의 `follower_profile_id`가 current Profile인 경우에만 허용한다. DELETE policy는 MUST current Profile이 follower 또는 followee인 pending row만 허용한다. UPDATE policy는 MUST 제공하지 않는다. SELECT policy 하나를 `FOR ALL`로 재사용해서 follower가 아닌 participant의 생성이나 비participant의 종료를 허용해서는 안 된다.

승인과 거절은 MUST followee command로, 취소는 MUST follower command로 유지한다. approve/reject/cancel이 모두 pending row 삭제를 포함하므로 database DELETE participant 경계는 애플리케이션의 command별 actor 검사를 대체하지 않는다.

#### Scenario: follower가 approval-required 요청을 생성함

- **WHEN** `kosmo_api` current Profile이 `follower_profile_id`인 새 pending Follow Request를 INSERT한다
- **THEN** INSERT가 허용된다
- **AND** row 존재 자체가 pending 상태를 뜻한다

#### Scenario: follower가 아닌 actor가 요청을 생성함

- **WHEN** `kosmo_api` current Profile이 새 row의 `follower_profile_id`와 다르거나 actor helper가 `NULL`이다
- **THEN** INSERT는 거부된다

#### Scenario: followee가 승인 또는 거절함

- **WHEN** current Profile이 followee이고 애플리케이션 command 검사를 통과해 pending request를 승인하거나 거절한다
- **THEN** 해당 ProfileFollowRequest DELETE가 허용된다
- **AND** follower가 approve 또는 reject mutation을 호출하면 애플리케이션 command 검사가 `PERMISSION_DENIED`로 거부해 DELETE와 후속 결과가 발생하지 않는다

#### Scenario: follower가 취소함

- **WHEN** current Profile이 follower이고 애플리케이션 command 검사를 통과해 pending request를 취소한다
- **THEN** 해당 ProfileFollowRequest DELETE가 허용된다
- **AND** followee가 cancel mutation을 호출하면 애플리케이션 command 검사가 `PERMISSION_DENIED`로 거부해 DELETE와 후속 결과가 발생하지 않는다

#### Scenario: 비participant가 request를 종료하려 함

- **WHEN** current Profile이 follower도 followee도 아닌 ProfileFollowRequest를 DELETE하려 한다
- **THEN** PostgreSQL은 row를 command 대상으로 제공하지 않고 GraphQL mutation은 `NOT_FOUND`를 반환한다

#### Scenario: pending row를 갱신하려 함

- **WHEN** `kosmo_api`가 ProfileFollowRequest를 UPDATE하려 한다
- **THEN** 허용하는 UPDATE policy가 없으므로 command는 적용되지 않는다

### Requirement: pending lifecycle과 Notification side effect를 보존한다

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, PROD-770. RLS 적용 뒤에도 시스템은 MUST 승인 시 pending ProfileFollowRequest를 제거하고 같은 follower/followee의 established `profile_follow`를 원자적으로 생성한다. 거절과 취소는 MUST pending row를 제거한다. 승인·거절·취소는 MUST 원본 Follow Request Notification 제거 경계를 유지하고, 새 관계를 만든 승인은 MUST 기존 Follow Notification post-commit side effect를 유지한다.

#### Scenario: 승인 lifecycle이 완료됨

- **WHEN** followee가 pending Follow Request를 승인한다
- **THEN** request 삭제와 established ProfileFollow 생성이 같은 transaction에서 완료된다
- **AND** Follow Request Notification 제거와 새 Follow Notification side effect가 기존 경계에서 실행된다

#### Scenario: 거절 또는 취소 lifecycle이 완료됨

- **WHEN** 올바른 followee가 거절하거나 올바른 follower가 취소한다
- **THEN** pending request가 제거되고 Accepted/Rejected 상태나 처리 시각을 저장하지 않는다
- **AND** 원본 Follow Request Notification 제거 경계가 실행된다

#### Scenario: 잘못된 actor command가 side effect를 만들지 않음

- **WHEN** follower가 승인·거절을 시도하거나 followee가 취소를 시도하거나 비participant가 command를 시도한다
- **THEN** pending row와 established relation은 변하지 않는다
- **AND** wrong-role participant는 `PERMISSION_DENIED`, nonparticipant는 `NOT_FOUND`를 반환한다
- **AND** Notification 생성·제거 side effect가 발생하지 않는다

### Requirement: 독립 RLS slice의 경계를 넘지 않는다

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/notification.md`, PROD-770, PROD-767. 이 change는 MUST established `profile_follow`와 다른 table의 RLS를 변경하지 않는다. 기존 GraphQL application predicate, selected Profile authorization, ActivityPub/trusted ingress와 `kosmo_worker` BYPASSRLS를 MUST 유지한다. Account membership 기반 cross-profile Notification 표시 parity는 MUST PROD-767 coverage gate에서 별도 분류하며 이 change의 core side effect 또는 selected recipient 검증만으로 완료를 주장하지 않는다. 파일별 migration behavior test를 MUST 추가하지 않으며, production preflight, sync/apply, principal cutover와 post-apply live 검증은 MUST 별도 명시 승인을 요구한다.

#### Scenario: migration만 구현됨

- **WHEN** schema metadata, migration, GraphQL regression과 비운영 role-level 검증이 완료된다
- **THEN** PROD-770의 독립 구현 증거만 성립한다
- **AND** PROD-767 전체 coverage, PROD-716 principal cutover 또는 production 적용 완료 증거로 사용하지 않는다

#### Scenario: Worker 또는 ActivityPub 경로가 request를 처리함

- **WHEN** `kosmo_worker` BYPASSRLS 또는 기존 owner 경계의 trusted non-GraphQL caller가 ProfileFollowRequest SQL을 실행한다
- **THEN** 별도 Worker policy 없이 기존 결과를 유지한다

#### Scenario: production 운영은 별도 승인임

- **WHEN** implementation, CI, Ready PR 또는 OpenSpec completion evidence가 준비된다
- **THEN** production preflight, sync/apply, cutover와 live 검증 권한이 생기지 않는다
