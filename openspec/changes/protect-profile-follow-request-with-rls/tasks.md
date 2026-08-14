## 1. PROD-770 implementation gate와 ProfileFollowRequest RLS

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- PROD-770

**Deliverable**

승인된 dependency와 오류 계약 아래 `profile_follow_request`가 `kosmo_api`의 selected Profile participant 조회, follower 생성과 participant 종료를 PostgreSQL RLS로 강제한다.

**Guardrails**

- Table별 독립 slice를 PROD-707 공통 inventory 완료에 종속시키지 않고 자기 SQL consumer와 권한 matrix를 검증한다.
- nonparticipant/absent request `NOT_FOUND`와 wrong-role participant `PERMISSION_DENIED`를 구분한다.
- policy role은 `kosmo_api`뿐이며 FORCE RLS, Worker policy, role/ACL/credential/session 변경이 없다.
- follower만 INSERT하고 participant만 SELECT/DELETE하며 UPDATE를 허용하지 않는다.
- established `profile_follow`와 다른 table RLS를 변경하지 않는다.

**Verification**

- 최신 Linear dependency와 승인된 오류 contract를 구현 직전에 다시 확인한다.
- schema metadata, migration SQL, snapshot과 PostgreSQL catalog에서 table RLS/FORCE 및 policy command/role/qual/check를 확인한다.
- 기존 migration history와 다른 table policy가 변하지 않았는지 확인한다.

- [x] 1.1 canonical·Linear와 OpenSpec Gate가 table별 독립 slice 및 mutation 오류 의미에 맞게 승인됐는지 확인한다.
- [x] 1.2 selected Profile participant SELECT, follower INSERT, participant DELETE와 closed UPDATE 결과를 구현한다.
- [x] 1.3 additive migration과 snapshot을 생성하고 `profile_follow` 및 다른 table RLS·기존 migration history에 diff가 없는지 확인한다.

## 2. PROD-770 GraphQL participant와 command 방향 검증

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/profile.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- PROD-770

**Deliverable**

ProfileFollowRequest Node, incoming/outgoing connection과 approve/reject/cancel이 selected Profile participant와 follower/followee command 방향을 보존한다.

**Guardrails**

- Account의 다른 membership Profile을 selected actor로 인정하지 않는다.
- follower approve/reject와 followee cancel을 허용하지 않는다.
- application participant/command predicate는 transition parity를 위해 유지한다.
- 파일별 migration behavior test를 추가하지 않는다.

**Verification**

- 실제 non-owner `kosmo_api`와 transaction-local actor setting을 사용하는 GraphQL integration에서 Node/connection/command 결과를 확인한다.
- follower, followee, outsider, 같은 Account의 다른 selected Profile, missing/empty/malformed context를 포함한다.
- wrong-role participant와 nonparticipant 오류, already-completed request 오류가 승인된 공개 계약과 일치하는지 확인한다.

- [x] 2.1 follower/followee Node와 outgoing/incoming connection 허용 및 outsider·other selected Profile·missing/malformed context 격리를 검증한다.
- [x] 2.2 follower-only 생성과 followee approve/reject, follower cancel 성공을 실제 `kosmo_api` operation에서 검증한다.
- [x] 2.3 wrong-role participant, nonparticipant, repeated completed request가 row/relation/count를 바꾸지 않고 승인된 오류 의미를 반환하는지 검증한다.

## 3. PROD-770 pending lifecycle와 trusted boundary 회귀

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `memory/database-design.md`
- PROD-770

**Deliverable**

RLS 뒤에도 pending-only 저장, approve/reject/cancel 결과, Notification side effect와 owner/`kosmo_worker` trusted 경계가 기존 결과를 유지한다.

**Guardrails**

- accepted/rejected 상태나 처리 history를 추가하지 않는다.
- approve만 established relation과 count를 만들고 reject/cancel은 relation/count를 바꾸지 않는다.
- Follow Request Notification 제거와 approve의 Follow Notification side effect를 유지한다.
- ActivityPub/Fedify/Worker RLS, Notification RLS와 side-effect ordering을 변경하지 않는다.
- Account membership 기반 cross-profile Notification 표시 parity는 PROD-767이 별도 분류하며 selected recipient/core side effect 검증을 그 전체 완료 증거로 과장하지 않는다.

**Verification**

- 기존 core service와 selected recipient GraphQL notification regression을 실행한다.
- 정확한 비운영 revision에서 owner와 `SET ROLE kosmo_worker`의 ProfileFollowRequest SELECT/INSERT/DELETE 및 established `profile_follow` 결과가 변하지 않는지 확인한다.

- [x] 3.1 approve의 request 삭제·established relation/count·Follow Notification과 request Notification cleanup을 검증한다.
- [x] 3.2 reject/cancel의 request/notification cleanup과 relation/count 불변을 검증한다.
- [x] 3.3 owner와 `kosmo_worker` BYPASSRLS 및 trusted Follow lifecycle 무회귀를 비운영 role matrix로 검증한다.

## 4. PROD-770 validation과 completion handoff

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `memory/database-migrations.md`
- `memory/issue-openspec-workflow.md`
- PROD-770

**Deliverable**

PROD-770의 독립 구현·검증·OpenSpec completion evidence와 downstream/production 경계가 과장 없이 Ready PR로 전달된다.

**Guardrails**

- 파일별 migration behavior test를 추가하지 않는다.
- PROD-770 결과를 PROD-767 전체 coverage나 PROD-716 principal cutover 완료로 일반화하지 않는다.
- production preflight, sync/apply, cutover와 live 검증을 수행하지 않으며 별도 명시 승인을 요구한다.
- 완료되지 않은 task나 실행하지 않은 검증을 성공으로 기록하지 않는다.

**Verification**

- generic migration replay/smoke, core database service, API integration, typecheck/lint/format과 OpenSpec target/all strict validation을 실행한다.
- 정확한 HEAD, 실행 명령과 결과, 미실행 운영 경계를 한국어 PR 본문에 기록한다.

- [x] 4.1 generic migration replay/smoke와 관련 core/API test 및 repository 정적 검증을 통과시킨다.
- [x] 4.2 exact non-production `kosmo_api`/`kosmo_worker` catalog·actor·command matrix와 representative index plan을 확인한다.
- [ ] 4.3 전체 task 완료 뒤 delta spec을 동기화하고 change archive 및 전체 strict validation을 통과시킨다.
- [ ] 4.4 변경을 의도별로 commit/push하고 production 미실행과 downstream 경계를 명시한 Ready PR을 연다.
