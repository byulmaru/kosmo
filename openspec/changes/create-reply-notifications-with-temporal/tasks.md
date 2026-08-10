## 1. PROD-722 Reply commit과 Workflow start 경계

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/architecture/core-services.md`
- `PROD-722`

**Deliverable**

Local과 ActivityPub의 실제 Reply commit 뒤 stable identity로 같은 Reply Notification Workflow start를 시도하고,
rollback·duplicate·start 실패는 committed Post 결과와 올바르게 격리된다.

**Guardrails**

- transaction과 start 사이 누락은 수용하며 intent/outbox/relay를 만들지 않는다.
- transaction 인자 또는 origin으로 Reply lifecycle을 생략하지 않는다.
- start 승인 또는 실패까지 await하되 Post·GraphQL·ActivityPub 성공을 되돌리지 않는다.
- 다른 ActivityPub delivery lifecycle을 이 task에서 재설계하지 않는다.

**Verification**

- Local/AP 실제 create, duplicate, self reply, outer commit/rollback과 start failure를 core·entrypoint test로 검증한다.
- commit 전 start 없음과 같은 Reply identity의 stable ID를 검증한다.

- [x] 1.1 core Post 생성 결과에 commit 뒤 한 번만 실행되는 Reply Workflow start effect를 제공한다.
- [x] 1.2 Local GraphQL과 ActivityPub production caller가 실제 create의 effect를 commit 뒤 await하도록 전환한다.
- [x] 1.3 기존 Reply Notification transaction savepoint 경로를 제거하고 start 실패 관측을 유지한다.
- [x] 1.4 commit·rollback·duplicate·origin·start 실패 경계의 자동화 검증을 추가하고 통과시킨다.

## 2. PROD-722 Reply Workflow와 Activity 수렴

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/objects/post.md`
- `PROD-722`

**Deliverable**

accepted Reply Workflow가 source를 다시 조회해 하나의 visible REPLY Notification 또는 안전한 no-op으로
수렴하고, transient DB 실패와 Worker 재시작 뒤 처리를 이어간다.

**Guardrails**

- source Reply ID만 durable input으로 사용하고 Profile/Post snapshot을 저장하지 않는다.
- 기존 recipient, Related Post/Profile, local recipient, self suppression, visibility와 unique 계약을 유지한다.
- source 부재만 terminal no-op으로 처리하고 transient DB 오류는 retry 가능한 Activity 실패로 유지한다.
- Reply identity 하나에는 Workflow history 하나만 유지한다.

**Verification**

- 유효 Reply, self reply, unavailable source, replay·concurrent start와 transient Activity failure를 검증한다.
- Worker 중단·재시작 뒤 accepted Workflow가 같은 identity로 Notification/no-op에 수렴함을 검증한다.

- [x] 2.1 Reply source를 처리하는 deterministic Workflow와 DB Activity를 구현한다.
- [x] 2.2 기존 Reply Notification persistence policy를 Activity에서 재사용하고 terminal source 부재와 retryable 오류를 구분한다.
- [x] 2.3 stable Workflow ID의 running conflict와 completed reuse 정책을 적용한다.
- [ ] 2.4 Workflow replay, Activity retry, source no-op과 Worker restart 수렴 검증을 추가하고 통과시킨다.

## 3. PROD-722 첫 Business Worker 등록과 배포 경계

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-722`
- `PROD-730`

**Deliverable**

독립 Worker가 `kosmo` task queue에서 Reply Workflow/Activity를 poll하고, 같은 환경 중립 chart가 dev/prod별 기존
replica·health·credential 계약으로 Worker와 Workflow client runtime 입력을 제공한다.

**Guardrails**

- smoke Workflow, 검증 전용 task queue와 두 번째 Worker runtime을 만들지 않는다.
- API/Web/Worker는 환경별로 같은 Temporal address와 namespace를 사용한다.
- Worker component는 기본 활성화하되 명시적 override rollback을 유지한다.
- production 실제 sync/release를 이 task에서 수행하지 않는다.

**Verification**

- Worker package build/test, workspace dependency·lockfile 정합성과 dev/prod Helm lint/render를 검증한다.
- 기본 render의 dev 1 replica/prod 2 replica, `kosmo` registration, probes, DB·Temporal 입력과 disable override를 검증한다.

- [x] 3.1 Worker entrypoint에 실제 Reply Workflow/Activity와 `kosmo` task queue를 등록한다.
- [x] 3.2 API/Web/Worker가 Workflow start와 Activity 실행에 필요한 runtime 입력과 package dependency를 갖추게 한다.
- [x] 3.3 환경 중립 Worker component를 기본 활성화하고 dev/prod render 및 명시적 disable rollback을 유지한다.
- [x] 3.4 package build/test, dependency lockfile, Helm lint와 dev/prod render 검증을 통과시킨다.

## 4. PROD-722 dev 통합 검증과 완료

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/architecture/core-services.md`
- `PROD-722`
- `PROD-730`

**Deliverable**

dev에서 Workflow-only Reply Notification과 Worker lifecycle의 실제 복구 경계를 증명하고 production을 변경하지
않은 채 PROD-722 change를 완료한다.

**Guardrails**

- dev live evidence와 production release를 분리한다.
- Temporal start 수락 전 누락과 수락 후 durable recovery를 구분해 기록한다.
- live 검증을 위해 source Post/Notification 외의 production data나 Argo 소유 resource를 임의 삭제하지 않는다.

**Verification**

- dev에서 Worker RUNNING/readiness, 실제 Local 또는 ActivityPub Reply Workflow, transient DB Activity retry와
  Worker restart 뒤 수렴을 확인한다.
- production workload와 namespace가 이 작업으로 sync되지 않았음을 확인한다.
- OpenSpec strict validation, 관련 workspace checks와 hosted CI를 통과시킨다.

- [ ] 4.1 구현 diff와 OpenSpec을 strict validation하고 관련 전체 test/lint/render를 통과시킨다.
- [ ] 4.2 main dev rollout에서 Worker readiness와 실제 Reply Notification Workflow 성공을 검증한다.
- [ ] 4.3 accepted Workflow의 transient Activity 실패 retry와 Worker restart 복구를 dev에서 검증한다.
- [ ] 4.4 production 미변경과 보장 경계 증거를 Linear/PR에 기록하고 전체 change가 완료되면 canonical spec을 동기화해 archive한다.
