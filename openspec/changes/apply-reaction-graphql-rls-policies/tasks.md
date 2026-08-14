## 1. PROD-769 Reaction GraphQL RLS policy

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`
- `docs/domain/decisions/0016-reaction-selector-current-state.md`
- `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`
- PROD-769

**Deliverable**

`reaction`이 `kosmo_api`의 Target Post 조회, selected Profile 추가·삭제와 hidden/deleted owner cleanup을 PostgreSQL RLS로 강제한다.

**Guardrails**

- policy role은 `kosmo_api`뿐이며 FORCE RLS, Worker policy, 역할·ACL·credential과 다른 table policy 변경이 없다.
- 조회 가능한 Target Post의 모든 Reaction을 SELECT해 viewer-independent count를 유지한다.
- owner cleanup은 hidden/deleted Target Post에서도 `DELETE ... RETURNING`을 유지하되 GraphQL Node/relation의 Target Post 경계를 넓히지 않는다.
- missing/empty/malformed actor와 non-owner INSERT/DELETE는 fail-closed 된다.
- 기존 Notification의 owner Reaction row lock은 임시 policy로 유지하되 실제 Reaction UPDATE는 fail-closed 된다.
- owner와 `kosmo_worker` BYPASSRLS를 유지한다.

**Verification**

- schema metadata, migration SQL과 PostgreSQL catalog에서 RLS/FORCE 및 policy role/command/mode/qual/check를 확인한다.
- blank disposable database에서 generic migration replay와 snapshot chain을 검증한다.

- [x] 1.1 Reaction schema metadata에 Target Post 및 owner SELECT, owner INSERT/DELETE와 실제 UPDATE를 막는 임시 owner lock RLS 계약을 반영한다.
- [x] 1.2 additive migration과 snapshot을 생성하고 기존 migration history, 역할·ACL 및 다른 table policy를 수정하지 않았는지 확인한다.
- [x] 1.3 policy catalog와 static diff에서 command별 actor/Target Post 경계, FORCE off와 no Worker policy를 확인한다.

## 2. PROD-769 GraphQL/core와 비운영 role matrix

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/decisions/0016-reaction-selector-current-state.md`
- `docs/design/reactions.md`
- PROD-769

**Deliverable**

실제 disposable `kosmo_api` operation principal에서 기존 Reaction Node/relation/viewer/count/add/delete/payload·Notification cleanup 결과가 유지되고 owner/Worker 경계가 검증된다.

**Guardrails**

- 파일별 migration behavior test를 추가하지 않는다.
- fixture setup과 검증용 owner connection을 GraphQL operation principal 증거로 과장하지 않는다.
- Profile 목록 visibility와 viewer selected Profile 격리를 유지한다.
- hidden/deleted owner cleanup과 다른 Profile Reaction/Notification 보존을 함께 검증한다.

**Verification**

- operation `current_user`가 `kosmo_api`인 상태로 기존 Reaction GraphQL integration을 실행한다.
- visible/hidden/deleted Post, owner/non-owner, missing/empty/malformed actor, Node/relation/viewer/count와 add/delete payload·cleanup을 검증한다.
- core Reaction/Notification regression, owner row lock/실제 UPDATE 거부와 representative owner/`kosmo_worker` BYPASSRLS를 검증한다.

- [x] 2.1 기존 Reaction GraphQL integration을 disposable `kosmo_api` operation principal로 실행하고 current principal을 증명한다.
- [x] 2.2 DELETED Target Post owner cleanup과 hidden/deleted GraphQL 비노출, `DELETE ... RETURNING` payload·Notification cleanup 회귀를 보강한다.
- [x] 2.3 viewer-independent count, Profile 목록, selected Profile viewer relation과 non-owner/invalid actor fail-closed matrix를 통과시킨다.
- [x] 2.4 core Reaction/Notification regression, owner row lock/실제 UPDATE 거부와 owner 및 `kosmo_worker` BYPASSRLS representative matrix를 통과시킨다.

## 3. PROD-769 검증과 publication handoff

**Authority / Provenance**

- PROD-769
- PROD-767
- `memory/database-migrations.md`
- `memory/commit-pr.md`

**Deliverable**

PROD-769의 독립 구현·비운영 증거를 과장 없이 Ready PR로 전달하고 production 운영 경계를 유지한다.

**Guardrails**

- Post/PostContent와 다른 table RLS, Worker/Fedify/Temporal/Post policy를 변경하지 않는다.
- production preflight, sync/apply, principal cutover와 live 검증을 수행하지 않는다.
- PR/CI/OpenSpec completion을 production 적용 증거로 표현하지 않는다.
- OpenSpec archive는 전체 declared scope 완료 뒤 별도 판단하며 Ready PR 전환과 동일시하지 않는다.

**Verification**

- focused DB/API/core checks, formatting/lint/type checks, Drizzle check, OpenSpec target/all strict validation과 `git diff --check`를 통과한다.
- implementation self-review에서 public contract, test seam, 범위와 production 미수행 상태를 확인한다.
- PR 제목/본문은 한국어로 작성하고 exact checks 및 미수행 운영 작업을 분리해 기록한다.

- [x] 3.1 focused migration/API/core 검증과 repository formatting·lint·type/Drizzle checks를 통과시킨다.
- [x] 3.2 OpenSpec target/all strict validation과 implementation self-review를 통과시키고 tasks를 실제 증거와 동기화한다.
- [ ] 3.3 의도한 파일만 commit/push하고 한국어 Ready PR을 열어 code/CI, 비운영 role matrix와 production 미수행 상태를 분리해 기록한다.
