## 1. PROD-725 Core Repost transition 경계

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-725`

**Deliverable**

Local GraphQL과 verified ActivityPub Announce·Undo가 같은 Core Repost domain 규칙을 사용하고, 실제 최초
create/delete commit만 committed transition 결과를 만든다.

**Guardrails**

- Local GraphQL은 Repost 상태만 저장하고, verified Announce·Undo만 Repost 상태와 current ActivityPub mapping을 같은 transaction에서 저장한다.
- duplicate·no-op·rollback은 transition 효과를 만들지 않는다.
- transaction Activity, proposed ID, command receipt, outbox와 새 row/advisory lock을 추가하지 않는다.
- ordinary Post delete의 Temporal 전환은 PROD-677에 남긴다.

**Verification**

- Local/AP create·delete, duplicate·concurrent·rollback, mapping collision·generation 경합과 ordinary Post delete
  회귀를 Core/Fedify integration test로 검증한다.

- [x] 1.1 Repost create와 pure Repost delete가 database handle·`postCommit` 없이 자체 transaction과 최초 transition 결과를 소유하게 한다.
- [x] 1.2 verified Announce materialization과 current-generation Undo가 Repost 상태와 ActivityPub mapping을 같은 Core transaction에서 처리하게 한다.
- [x] 1.3 duplicate·no-op·rollback·교차 경합의 기존 수렴과 GraphQL payload를 보존하는 focused test를 갱신한다.

## 2. PROD-725 Repost effects Workflow와 Worker registration

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- `docs/architecture/core-services.md`
- `PROD-448`
- `PROD-722`
- `PROD-725`

**Deliverable**

최초 Repost create/delete commit 뒤 accepted Workflow가 Notification lifecycle과 Local-origin Announce·Undo
queue handoff를 독립적으로 재시도하며, 하나의 Worker host가 Post Create와 Repost registration을 함께 poll한다.

**Guardrails**

- create와 delete Workflow identity를 분리하고 종료된 같은 transition ID를 재사용하지 않는다.
- ActivityPub origin은 outbound echo를 만들지 않는다.
- Activity 성공은 Fedify queue acceptance이며 remote retry·ordering은 Fedify가 소유한다.
- 한 Activity terminal failure가 다른 적용 가능한 Activity 시도를 막지 않는다.
- 별도 Worker host·task queue, optional registry, generic startup API와 새 Temporal Client wrapper를 만들지 않는다.

**Verification**

- start options, create/delete identity, fixed Worker registration, Activity persistence의 멱등성과 terminal no-op을
  unit 및 package-level test로 검증한다. origin 분기, Activity retry·independence와 restart 복구는 4.3의 실제 dev
  Temporal history로 검증한다.

- [x] 2.1 committed Repost transition의 type·input·stable create/delete start policy와 delete 최소 snapshot을 Core Temporal domain 경계에 추가한다.
- [x] 2.2 Repost Notification create/delete와 canonical Announce·Undo queue handoff Activity를 멱등하게 등록한다.
- [x] 2.3 적용 가능한 effects를 독립 실행하는 Repost Workflow를 구현하고 Post Create와 함께 singleton Worker registry에 조립한다.
- [x] 2.4 start failure·duplicate start, fixed registration, Notification Activity retry 멱등성과 terminal no-op 검증을 추가한다.

## 3. PROD-725 API·Fedify caller 단순화와 통합 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `PROD-725`

**Deliverable**

GraphQL과 Fedify caller는 Core action의 committed 결과와 기존 성공·acknowledgement 의미만 사용하고 database
handle, `ctx.db`, 반환형 `postCommit` 또는 후속 효과를 직접 조립하지 않는다.

**Guardrails**

- Workflow start와 effects 실패가 committed Repost 또는 caller 성공을 rollback하지 않는다.
- public GraphQL schema와 Repost·Notification read 결과를 변경하지 않는다.
- Fedify request context나 vocab 객체를 Core transaction 입력으로 전달하지 않는다.

**Verification**

- GraphQL create/delete 성공, inbound Announce·Undo acknowledgement, start failure 격리, Local/AP origin과 direct
  effect 미호출을 integration test로 검증한다.

- [x] 3.1 Repost와 delete GraphQL resolver에서 database handle 및 `postCommit` 조립을 제거한다.
- [x] 3.2 inbound Announce·Undo caller를 검증된 serializable input과 Core 결과만 사용하는 경계로 단순화한다.
- [x] 3.3 API·Fedify integration test를 effects Workflow start와 committed-result 격리 계약으로 갱신한다.

## 4. PROD-725 계약 동기화와 dev 통합 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/architecture/core-services.md`
- `PROD-448`
- `PROD-725`

**Deliverable**

저장소의 active Repost 계약이 PROD-725와 일치하고, exact application revision의 dev 환경에서 Repost effects
Workflow와 Worker retry·restart가 실제로 동작한다.

**Guardrails**

- `add-post-reposts`의 오래된 `postCommit`·retry 없음 문구를 현재 권위로 남기지 않는다.
- PR/CI와 OpenSpec validation을 dev-live 또는 production 증거로 표현하지 않는다.
- production sync/apply/cutover/live verification은 별도 사용자 승인 없이는 수행하지 않는다.

**Verification**

- OpenSpec strict validation, workspace lint/typecheck/test, exact revision dev rollout 상태, Temporal Workflow history,
  Notification 및 Fedify queue 효과와 Worker restart 뒤 retry를 각각 증거로 남긴다.

- [x] 4.1 active `add-post-reposts` artifacts의 PROD-669 `postCommit`·Best Effort lifecycle을 PROD-725 소유 경계로 동기화한다.
- [x] 4.2 관련 package lint, typecheck, unit/integration test와 OpenSpec strict validation을 통과시킨다.
- [ ] 4.3 exact revision을 dev에서 검증하고 create/delete effects, duplicate no-start, AP no-echo, Activity 독립 실행·유한 retry와 Worker restart 복구 증거를 수집한다.
- [x] 4.4 production 미변경을 확인하고 PR/CI, dev-live, production evidence를 분리해 결과를 기록한다.
- [ ] 4.5 integration owner가 `add-post-reposts`를 먼저 archive한 뒤 canonical Notification spec을 확인하고, 이 change의 Completion Gate 승인 후 별도 archive owner가 최종 archive와 strict validation을 수행한다.
