## Context

현재 ProfileFollowRequest Node loader는 `profileFollowRequestAccessWhere`로 follower/followee participant를 검사하고, Profile의 incoming/outgoing connection은 resolver가 대상 Profile과 session selected Profile의 일치를 먼저 확인한다. approve/reject/cancel resolver는 selected Profile ID를 core service에 전달하고, core service가 approve/reject는 followee, cancel은 follower인지 검사한 뒤 pending row를 삭제한다.

GraphQL의 approval-required follow 생성도 같은 table에 INSERT하며, request 생성과 종료는 Follow Request Notification 생성·제거 및 승인 후 Follow Notification 생성 경계와 연결된다. ActivityPub inbound/Undo와 trusted service 경로도 같은 table을 사용하지만 `kosmo_worker` BYPASSRLS 또는 owner 경계에 남는다.

PROD-370의 `public.kosmo_current_profile_id()`는 누락·빈 값·malformed UUID를 `NULL`로 반환하고, PROD-726 operation session은 GraphQL selected Profile context를 제공한다. PROD-724는 runtime role의 object ACL을 별도로 소유하므로 이 change는 table RLS와 row policy만 추가한다.

## Goals / Non-Goals

**Goals:**

- `kosmo_api`가 selected Profile이 참여한 pending Follow Request만 조회하고 종료하게 한다.
- GraphQL follow 생성은 current follower로 제한하고 UPDATE를 허용하지 않는다.
- approve/reject/cancel의 기존 followee/follower command 방향과 pending-only lifecycle을 유지한다.
- Notification side effect와 owner/Worker trusted 경계를 회귀 없이 보존한다.
- GraphQL observable regression, generic migration replay와 비운영 role matrix로 policy를 검증한다.

**Non-Goals:**

- established `profile_follow` 또는 Notification을 포함한 다른 table의 RLS·ACL 변경
- application authorization predicate 제거, credential/session selector 변경 또는 GraphQL principal cutover
- ActivityPub/Fedify/Temporal Worker에 RLS 적용
- accepted/rejected 상태, 처리 시각 또는 delivery 상태 저장
- 파일별 migration behavior test, production preflight/sync/apply/cutover/live 검증

## Implementation Guidance

### Current Constraints

- approve/reject/cancel은 모두 `profile_follow_request` DELETE를 포함한다. PostgreSQL은 GraphQL mutation 이름을 알 수 없으므로 DELETE policy만으로 followee 승인·거절과 follower 취소를 구분할 수 없다. 기존 core actor-role 검사를 유지해야 한다.
- 승인된 오류 계약은 nonparticipant 또는 존재하지 않는 request를 `NOT_FOUND`, participant지만 잘못된 역할의 command를 `PERMISSION_DENIED`로 구분한다. participant SELECT RLS가 nonparticipant row를 core 검사 전에 숨기는 결과는 이 계약과 일치하고, participant row는 기존 core actor-role 검사까지 도달한다.
- RLS를 활성화한 뒤 INSERT policy가 없으면 approval-required `followProfile`이 `kosmo_api` 전환 시 실패한다. 생성 row는 current Profile이 follower인 경우만 허용해야 한다.
- `ensureProfileFollowRequest`의 established fast path와 conflict recovery는 pending row를 SELECT/DELETE할 수 있다. GraphQL caller의 follower는 해당 row participant이므로 같은 actor context에서 수행 가능해야 한다.
- 승인 transaction은 request를 읽고 established `profile_follow`를 만든 뒤 pending row를 제거한다. 이 change는 `profile_follow` RLS를 추가하거나 승인 transaction 구조를 바꾸지 않는다.
- post-commit Notification 함수는 request 존재 또는 삭제 결과를 다시 확인한다. `profile_follow_request`는 UPDATE policy를 두지 않으므로 GraphQL operation handle의 source lookup은 participant SELECT-only로 수행한다. owner/Worker trusted global 경로는 기존 `FOR UPDATE` source lock을 유지한다.
- 기존 follower/followee index와 pair unique index가 SELECT/INSERT conflict/DELETE predicate를 지원한다. 실제 plan 근거 없이 index를 추가하지 않는다.

### Recommended Approach

Drizzle `ProfileFollowRequests` table을 RLS metadata variant로 전환하고 `TO kosmo_api`에만 다음 세 command policy를 선언하는 경로를 기본으로 검토한다.

1. `FOR SELECT USING (follower_profile_id = kosmo_current_profile_id() OR followee_profile_id = kosmo_current_profile_id())`
2. `FOR INSERT WITH CHECK (follower_profile_id = kosmo_current_profile_id())`
3. `FOR DELETE USING (follower_profile_id = kosmo_current_profile_id() OR followee_profile_id = kosmo_current_profile_id())`

UPDATE policy는 만들지 않는다. SELECT와 DELETE가 같은 participant predicate를 사용하더라도 별도 command policy로 선언해 INSERT까지 participant 전체에 열리는 `FOR ALL` policy를 피한다. approve/reject/cancel 방향은 core service의 기존 actor-role 검사와 GraphQL integration test가 계속 소유한다.

생성된 additive migration과 snapshot에서 RLS enablement, FORCE off, policy command/role/qual/check를 확인한다. 기존 migration history는 수정하지 않는다. 별도 파일별 policy test를 만들지 않고 generic migration smoke와 기존 core/API tests를 사용한다. 정확한 비운영 revision에서는 실제 `SET ROLE kosmo_api`와 transaction-local Profile setting으로 participant/nonparticipant, other membership, missing/empty/malformed, INSERT/DELETE/UPDATE 및 owner/Worker bypass를 확인한다.

기존 `profileFollowRequestAccessWhere`, connection selected Profile check와 core actor-role 검사는 transition parity를 위해 유지한다. 이 PR에서 application predicate를 제거하거나 RLS 성공을 PROD-767 coverage 또는 PROD-716 cutover 완료로 확대하지 않는다.

### Allowed Alternatives

- SELECT와 DELETE predicate를 동일한 SQL fragment/helper로 schema 코드에서 공유할 수 있다. 생성되는 PostgreSQL policy는 command별로 분리되고 INSERT가 follower-only이며 UPDATE가 닫혀 있어야 한다.
- 같은 결과를 내는 hand-written migration SQL을 사용할 수 있다. Drizzle schema metadata, snapshot과 실제 catalog가 일치해야 한다.

### Known Traps

- `FOR ALL` participant policy는 followee에게 INSERT를 허용하고 UPDATE까지 열어 pending-only lifecycle을 훼손한다.
- DELETE policy가 followee-only이면 cancel이, follower-only이면 approve/reject가 `kosmo_api`에서 실패한다.
- DELETE participant policy가 있다는 이유로 core command-role 검사를 제거하면 follower approve/reject 또는 followee cancel을 database가 구분하지 못한다.
- Account의 모든 membership Profile을 actor로 인정하면 selected Profile 격리가 깨진다.
- `TO PUBLIC`, role 생략, FORCE RLS 또는 Worker policy 추가는 GraphQL-only 경계를 넓힌다.
- Notification 회귀를 해결한다며 Notification table RLS나 side-effect ordering을 바꾸면 PROD-770 범위를 넘는다.
- GraphQL operation source lookup에 `FOR UPDATE`나 `FOR KEY SHARE`를 유지하려고 UPDATE policy를 추가하면 closed UPDATE 계약을 깨뜨린다. PostgreSQL에서 두 locking SELECT 모두 UPDATE policy visibility를 요구하므로 non-owner handle은 SELECT-only여야 한다.
- migration/CI/Ready PR을 실제 principal cutover나 production 적용 증거로 해석하면 안 된다.

## Risks / Trade-offs

- [DELETE policy는 participant 둘 모두에게 열려 command 의미를 단독 강제하지 못한다] → core followee/follower actor-role 검사를 유지하고 잘못된 participant mutation이 row와 side effect를 바꾸지 않는 GraphQL integration을 검증한다.
- [nonparticipant와 absent request가 모두 NotFound이므로 caller가 두 상태를 구분할 수 없다] → 이는 request 존재를 숨기는 승인된 계약이며, participant wrong-role만 기존 core 검사로 PermissionDenied를 유지한다.
- [RLS와 application predicate가 일시적으로 중복된다] → additive parity 검증을 우선하고 predicate 제거는 PROD-767 coverage/cutover 이후 명시 owner가 있을 때만 수행한다.
- [Notification source loader도 같은 table RLS 영향을 받는다] → selected recipient/followee와 participant matrix를 GraphQL regression에 포함하고 trusted caller는 기존 source-lock regression 및 BYPASSRLS/owner 경계를 유지한다. `kosmo_api` SELECT-only lookup과 terminal delete의 드문 경합은 loose Notification row를 남길 수 있지만, source가 없으면 Node·connection·count·Read에서 숨기는 기존 loose-source 계약을 따른다.
- [policy DDL이 table lock을 획득한다] → 하나의 additive migration으로 배포하고 문제가 있으면 적용된 history를 고치지 않은 새 forward migration으로 policy와 RLS를 제거한다.

## Migration Plan

1. `profile_follow_request` schema metadata에 RLS와 `kosmo_api` SELECT/INSERT/DELETE policy를 추가한다.
2. additive Drizzle migration과 snapshot을 생성하고 기존 migration history와 다른 table policy가 변하지 않았는지 확인한다.
3. generic blank database replay, core/API regression과 exact non-production role matrix를 실행한다.
4. Ready PR은 구현·비운영 검증 범위만 설명하고 PROD-767 전체 coverage와 PROD-716 principal cutover를 후속으로 유지한다.
5. cutover 전 rollback이 필요하면 새 forward migration으로 세 policy를 제거하고 table RLS를 비활성화한다.
6. production preflight, sync/apply, cutover와 live 검증은 이 계획에서 실행하지 않으며 별도 명시 승인을 요구한다.

## Open Questions

없음.
