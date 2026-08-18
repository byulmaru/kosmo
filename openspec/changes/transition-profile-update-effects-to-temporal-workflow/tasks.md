## 1. PROD-665 Profile update transaction과 Workflow start

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/architecture/core-services.md`
- `PROD-665`

**Deliverable**

Core가 Profile 수정 transaction을 완료하고 실제 actor-visible commit에만 stable identity의 Effects Workflow start를 시도하며, API caller는 database handle이나 post-commit callback을 조립하지 않는다.

**Guardrails**

- displayName, bio, followPolicy, avatar, header의 실제 변경만 효과 대상이다.
- Tag, default Post visibility, no-op, validation·authorization 실패와 rollback에는 Workflow가 없다.
- Start 실패와 commit-to-start gap은 committed Profile 성공을 바꾸지 않는다.
- Transaction Activity, projection version, outbox, receipt, relay와 DB migration을 추가하지 않는다.

**Verification**

- Core service와 GraphQL integration에서 실제 변경, no-op, 비대상 변경, rollback, start 실패 격리를 검증한다.

- [x] 1.1 Profile action이 자체 transaction과 실제 actor-visible 변경 판정을 유지하며 commit 뒤 Workflow start를 소유하도록 구현한다.
- [x] 1.2 API caller의 database handle 전달과 post-commit callback 실행을 제거한다.
- [x] 1.3 Core/API 테스트를 새 Workflow start 경계로 갱신하고 관련 검증을 통과시킨다.

## 2. PROD-665 Profile Update delivery Activity

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `docs/architecture/core-services.md`
- `PROD-448`
- `PROD-629`
- `PROD-665`

**Deliverable**

Accepted Profile Update Workflow가 stable update identity로 delivery 시점의 최신 canonical `Update(Person)`을 Fedify queue에 handoff하고 Worker restart·Activity retry에서 재개된다.

**Guardrails**

- Temporal Workflow ID는 자동 생성한 update identity 자체다.
- 같은 Activity retry는 동일한 ActivityPub Update identity를 재사용한다.
- 빠른 연속 update는 latest-at-delivery/last-write-wins이며 ordering 또는 commit 시점 snapshot을 보장하지 않는다.
- 기존 singleton Worker와 compile-time registry를 사용하고 별도 host, enable flag, startup wrapper, Core contract file 또는 test-only export를 추가하지 않는다.
- Temporal Activity 성공 경계는 Fedify queue acceptance다.

**Verification**

- Fedify delivery의 stable identity와 최신 projection, 실제 production Workflow bundle의 Activity 실행·retry를 검증한다.

- [x] 2.1 Fedify Profile Update delivery가 입력된 stable identity로 canonical Update IRI를 구성하도록 구현한다.
- [x] 2.2 기존 Worker registry에 Profile Update Effects Workflow와 delivery Activity를 추가한다.
- [x] 2.3 Fedify/Worker 테스트를 stable retry identity와 production bundle 경계로 갱신하고 관련 검증을 통과시킨다.

## 3. PROD-665 통합 검증과 handoff

**Authority / Provenance**

- `docs/architecture/core-services.md`
- `PROD-665`

**Deliverable**

구현 revision이 정적·통합 검증과 dev의 rapid update·retry·restart 증거를 갖고, OpenSpec 완료 여부가 PR readiness와 별도로 기록된다.

**Guardrails**

- PR/CI를 dev 또는 production live evidence로 대체하지 않는다.
- Production sync·apply·cutover·live verification을 수행하지 않는다.
- OpenSpec archive는 전체 task와 dev 검증이 완료된 뒤 이 작업의 owner가 수행한다.

**Verification**

- OpenSpec strict validation, 관련 package typecheck/lint/test, PR CI, exact revision dev evidence를 각각 구분해 기록한다.

- [x] 3.1 OpenSpec strict validation과 관련 Core/API/Fedify/Worker 정적·통합 검증을 완료한다.
- [x] 3.2 구현을 commit·push하고 Ready PR로 handoff하되 production 증거로 과장하지 않는다.
- [ ] 3.3 Exact revision을 dev에서 빠른 연속 Profile update, Activity retry, Worker restart로 검증한다.
- [ ] 3.4 전체 task와 delta sync 가능성을 재확인한 뒤 이 change를 archive한다.
