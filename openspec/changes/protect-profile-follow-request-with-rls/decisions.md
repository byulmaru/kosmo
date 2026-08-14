## Context

이 기록은 PROD-770의 selected Profile participant RLS, pending-only lifecycle, follower/followee command 방향, Notification side effect와 Worker BYPASSRLS 경계를 구체화한다. Table별 독립 slice를 공통 inventory issue로 막지 않으며, nonparticipant/absent request와 wrong-role participant의 오류 의미를 분리한다.

## Decision Records

### RLS policy는 kosmo_api에만 적용하고 owner와 Worker 우회를 유지한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, PROD-770, PROD-767
- Status: Active
- Context / Problem: GraphQL selected Profile의 행 권한을 database에서 강제하면서 ActivityPub/trusted ingress와 Worker의 기존 Follow Request lifecycle을 같은 policy로 제한하면 runtime ownership이 섞인다.
- Decision Outcome: `profile_follow_request`는 RLS를 활성화하되 FORCE RLS는 비활성화하고 policy role은 `kosmo_api`로 한정한다. `kosmo_worker` policy는 만들지 않고 기존 BYPASSRLS와 owner/migration 경계를 유지한다.
- Alternatives Considered: `PUBLIC` policy나 Worker 전용 permissive policy는 GraphQL-only 범위를 넓히고 이미 선언된 trusted boundary를 중복한다.
- Consequences: migration은 독립 additive slice일 수 있지만 실제 GraphQL principal cutover와 production 운영은 이 change가 소유하지 않는다.
- Confirmation / Follow-up: catalog의 RLS/FORCE/policy role과 owner·Worker 결과를 정확한 비운영 revision에서 검증한다.

### selected Profile participant가 조회하고 follower만 생성한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-770
- Status: Active
- Context / Problem: Account의 다른 membership Profile 또는 missing/malformed actor가 pending request를 조회·생성하면 selected Profile isolation과 follower 방향이 깨진다.
- Decision Outcome: SELECT는 current Profile이 follower 또는 followee인 row로, INSERT는 current Profile이 follower인 새 row로 제한한다. Account membership 전체를 actor로 인정하지 않고 missing/empty/malformed helper 결과는 fail-closed한다.
- Alternatives Considered: Account membership 전체 허용은 selected Profile 밖 request를 노출한다. participant 전체 INSERT 허용은 followee가 follower identity를 대신해 request를 생성하게 한다.
- Consequences: GraphQL Node/connection과 approval-required follow 생성은 같은 selected Profile setting에 종속한다.
- Confirmation / Follow-up: follower/followee/outsider/other membership/missing·malformed matrix를 Node, connection과 actual role SQL로 검증한다.

### pending 종료는 participant DELETE와 기존 command-role 검사를 함께 사용한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, PROD-770
- Status: Active
- Context / Problem: 승인·거절·취소는 모두 pending row DELETE를 포함하지만 승인·거절 actor는 followee, 취소 actor는 follower다. PostgreSQL DELETE policy는 GraphQL mutation 이름을 구분하지 못한다.
- Decision Outcome: DELETE RLS는 current Profile이 follower 또는 followee인 participant row만 허용하고, core service의 approve/reject followee 검사와 cancel follower 검사를 유지한다. UPDATE policy는 두지 않는다.
- Alternatives Considered: followee-only DELETE는 cancel을, follower-only DELETE는 approve/reject를 막는다. participant `FOR ALL`은 INSERT와 UPDATE까지 열어 pending lifecycle을 훼손한다.
- Consequences: database는 비participant row를 차단하고 application은 participant 내부 command 의미를 계속 강제한다. 둘 중 하나를 제거할 수 없다.
- Confirmation / Follow-up: follower approve/reject, followee cancel과 outsider command가 request/relation/count/Notification을 바꾸지 않는지 검증한다.

### pending lifecycle과 Notification side effect를 변경하지 않는다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `memory/database-design.md`, PROD-770
- Status: Active
- Context / Problem: RLS 도입이 request 상태 저장, established relation ownership 또는 post-commit Notification ordering까지 바꾸면 독립 slice와 rollback 경계가 무너진다.
- Decision Outcome: row 존재 자체가 pending이며 approve는 request 삭제와 established `profile_follow` 생성을 원자적으로 수행한다. reject/cancel은 request만 삭제하고, 세 종료 command는 Follow Request Notification 제거를 유지하며 새 관계를 만든 approve는 Follow Notification side effect를 유지한다. closed UPDATE RLS를 지키기 위해 GraphQL operation handle의 Follow Request Notification source lookup은 SELECT-only로 수행하고, owner/Worker trusted global 경로는 기존 `FOR UPDATE` source lock을 유지한다.
- Alternatives Considered: 상태 column이나 처리 history 추가, Notification RLS 변경, locking SELECT를 위한 UPDATE policy 추가는 현재 canonical lifecycle·closed UPDATE와 PROD-770 제외 범위를 바꾼다. `FOR KEY SHARE`도 실제 `kosmo_api` RLS에서 source row를 숨겨 Notification 생성을 보존하지 못했다. 모든 경로의 lock 제거는 trusted 경로의 기존 race barrier까지 약화한다.
- Consequences: established `profile_follow`, Notification과 다른 table RLS는 변경하지 않는다. `kosmo_api` SELECT-only lookup과 terminal delete가 드물게 경합하면 loose Notification row가 남을 수 있으나 source visibility 경계가 API에서 숨기며, 이를 물리적 무고아 보장으로 과장하지 않는다.
- Confirmation / Follow-up: 기존 core lifecycle·notification regression과 GraphQL payload/count 결과를 실행한다.

### nonparticipant와 absent request는 NotFound로 통합한다

- Decision Date: 2026-08-14
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/follow-request.md`, PROD-770
- Status: Active
- Context / Problem: participant SELECT RLS는 nonparticipant row를 core actor 검사 전에 숨긴다. 별도 privileged existence seam을 만들면 request 존재를 오류 차이로 노출하고 새 보안 경계를 추가한다.
- Decision Outcome: 존재하지 않거나 current selected Profile이 nonparticipant인 request mutation은 모두 `NOT_FOUND`를 반환한다. participant지만 approve/reject followee 또는 cancel follower 역할이 아닌 경우에만 기존 core 검사로 `PERMISSION_DENIED`를 반환한다.
- Alternatives Considered: privileged existence helper로 nonparticipant `PERMISSION_DENIED`와 absent `NOT_FOUND`를 구분하는 방식은 request 존재를 노출하고 범위를 넓힌다. 모든 participant mismatch를 NotFound로 바꾸면 wrong-role command 의미까지 숨긴다.
- Consequences: 단순 participant SELECT RLS가 보안 계약과 일치하며 broad bypass/helper가 필요 없다. 기존 nonparticipant PermissionDenied 기대는 NotFound로 갱신한다.
- Confirmation / Follow-up: GraphQL integration에서 outsider/absent NotFound와 follower approve/reject·followee cancel PermissionDenied를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### 단순 participant policy가 기존 mutation 오류 계약을 자동 보존한다

- Decision Date: 2026-08-14
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/follow-request.md`, PROD-770
- Status: Superseded
- Context / Problem: 초기 설계는 participant SELECT/DELETE policy와 기존 core actor-role 검사만으로 기존 GraphQL 오류 의미까지 보존된다고 가정했다.
- Decision Outcome: 이 가정을 폐기한다. nonparticipant row가 core 검사 전에 숨겨져 `PERMISSION_DENIED`가 `NOT_FOUND`로 바뀌는 실제 SQL 순서가 반증했다.
- Alternatives Considered: 해당 변화 수용은 upstream 승인 없이 관찰 가능한 계약을 바꾼다. broad bypass는 participant RLS 경계를 약화한다.
- Consequences: 이 초기 가정 대신 nonparticipant/absent NotFound와 wrong-role participant PermissionDenied 계약을 적용한다.
- Confirmation / Follow-up: 변경된 canonical·Linear authority와 active decision을 GraphQL integration으로 검증한다.
