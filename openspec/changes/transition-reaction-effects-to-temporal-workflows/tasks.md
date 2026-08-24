## 1. PROD-723 Reaction Effects Workflow 계약과 Worker

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/notification.md`
- `docs/architecture/core-services.md`
- `PROD-722`
- `PROD-723`

**Deliverable**

Worker가 committed Reaction create/delete transition의 Notification과 Local-origin ActivityPub queue handoff를 분리된 Workflow로 독립 재시도한다.

**Guardrails**

- Create와 Delete는 별도 Workflow type과 stable ID를 사용한다.
- Delete input은 삭제 row의 immutable Reaction 값과 origin만 포함한다.
- ActivityPub origin은 outbound echo를 만들지 않는다.
- 하나의 Worker instance와 compile-time registration을 유지하며 runtime enable flag나 테스트 전용 export를 만들지 않는다.

**Verification**

- Core service가 committed transition마다 Workflow type, input, stable ID, task queue와 conflict/reuse policy를 직접 전달하고, Worker의 실제 Workflow integration test가 해당 입력을 실행한다.
- Worker build로 production Activity registry를 검증하고, 실제 production Workflow bundle을 공식 Temporal test environment에서 실행해 Local/ActivityPub 분기와 sibling Activity failure 격리를 검증한다.
- Activity retry와 Worker restart 후 재개는 exact revision의 dev Workflow 실행으로 검증한다.

- [x] 1.1 Reaction create/delete Workflow input을 실제 Workflow module에 두고, Core service가 stable Workflow ID와 start policy를 직접 전달하도록 구현한다.
- [x] 1.2 Notification과 federation handoff를 독립 실행하는 create/delete Effects Workflow를 구현한다.
- [x] 1.3 기존 Worker host에 필요한 Activities와 두 Workflow를 compile-time 등록한다.
- [x] 1.4 Worker Activity registry build와 실제 Workflow의 Local/AP 분기·sibling failure 통합 검증을 통과시킨다.

## 2. PROD-723 Core Reaction transaction과 caller 경계

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/decisions/0016-reaction-selector-current-state.md`
- `docs/architecture/core-services.md`
- `PROD-723`

**Deliverable**

Local GraphQL과 verified ActivityPub ingress가 기존 Reaction domain 규칙과 inbound mapping atomicity를 유지하면서 실제 commit 뒤에만 해당 Effects Workflow를 시작한다.

**Guardrails**

- Public caller의 database handle과 반환형 `postCommit`을 제거한다.
- ActivityPub Reaction과 mapping의 동일 transaction, first-write와 exact Undo를 유지한다.
- Duplicate, mapped-only, no-op와 rollback에는 Workflow를 시작하지 않는다.
- 기존 uniqueness와 삭제 ABA를 유지하고 transaction Activity, 새 row lock, schema·migration을 추가하지 않는다.
- Start failure와 observer failure가 committed Reaction 또는 caller 성공을 바꾸지 않는다.

**Verification**

- Core add/delete의 duplicate, concurrent DML, ABA, rollback과 실제 transition별 start를 검증한다.
- Inbound mapping의 CREATED, MAPPED, DUPLICATE, URI conflict, rollback과 exact Undo를 검증한다.
- API/Fedify typecheck와 integration test에서 database handle·`postCommit` 제거 및 AP no-echo를 확인한다.

- [x] 2.1 Local과 inbound action이 공유할 Core transaction 경계를 정렬하고 public database handle·`postCommit` 계약을 제거한다.
- [x] 2.2 실제 create commit 뒤 Create Effects Workflow를 시작하고 duplicate·mapped-only·rollback에서는 시작하지 않게 한다.
- [x] 2.3 실제 delete commit의 returned Reaction 값으로 Delete Effects Workflow를 시작하고 no-op·rollback에서는 시작하지 않게 한다.
- [x] 2.4 GraphQL과 Fedify caller를 새 Core 반환형으로 전환한다.
- [x] 2.5 Core/API/Fedify의 idempotency, ABA, mapping atomicity, start failure와 no-echo 검증을 통과시킨다.

## 3. PROD-723 Reaction Notification과 ActivityPub 효과

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/notification.md`
- `PROD-328`
- `PROD-413`
- `PROD-419`
- `PROD-448`
- `PROD-499`
- `PROD-723`

**Deliverable**

Worker Activities가 기존 Reaction Notification과 Like·EmojiReact·Undo projection을 같은 identity와 정책으로 멱등 실행하며 source transaction을 잠그지 않는다.

**Guardrails**

- Notification recipient, self suppression, visibility와 unique source 정책을 유지한다.
- Reaction Notification 생성의 `FOR UPDATE` source lock을 제거한다.
- Unavailable Notification은 기존 API visibility로 숨기고 durable reconciliation은 PROD-328에 남긴다.
- Like·EmojiReact·Undo의 actor, object, audience, recipient, activity URI와 ordering key를 유지한다.
- Federation Activity 성공 경계는 Fedify queue acceptance이며 remote retry를 Worker로 옮기지 않는다.

**Verification**

- Notification create/delete retry, self suppression, visibility와 source delete race를 검증한다.
- Deleted Reaction input으로 exact Undo를 만들고 type별 Like·EmojiReact, stable ordering key와 unavailable target no-op을 검증한다.

- [x] 3.1 Reaction Notification 생성·정리를 Worker Activity에서 직접 호출 가능한 멱등 Core 효과로 정렬한다.
- [x] 3.2 Reaction Notification source lock을 제거하고 source 삭제 경합 및 unavailable API 숨김을 검증한다.
- [x] 3.3 Create ID와 Delete snapshot으로 기존 Like·EmojiReact·Undo queue handoff를 실행하도록 delivery 경계를 정렬한다.
- [x] 3.4 Notification과 Fedify delivery의 focused test 및 typecheck를 통과시킨다.

## 4. PROD-723 통합 검증과 완료

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/notification.md`
- `docs/architecture/core-services.md`
- `PROD-723`

**Deliverable**

구현 revision이 repository 정적·통합 검증과 dev의 실제 Effects Workflow retry·restart 검증을 통과하고 OpenSpec과 Linear에 정확한 완료 증거가 남는다.

**Guardrails**

- PR/CI, merge, dev-live와 production 증거를 구분한다.
- Production sync, apply, cutover와 live verification은 별도 사용자 승인 없이 수행하지 않는다.
- UI/API schema, Fedify queue consumer, Follow/Profile/Post/Repost Workflow와 PROD-328 구현을 변경하지 않는다.

**Verification**

- OpenSpec strict validation, formatting, lint, typecheck와 관련 Core/API/Fedify/Worker test를 통과시킨다.
- Exact commit의 dev에서 Local/AP create/delete effects, Activity retry와 Worker restart 후 재개를 관측한다.
- Unresolved review와 CI 상태를 확인하고 OpenSpec archive 조건을 별도로 판정한다.

- [x] 4.1 `openspec validate transition-reaction-effects-to-temporal-workflows --strict`와 repository 정적 검증을 통과시킨다.
- [x] 4.2 관련 Core/API/Fedify/Worker unit·integration test를 통과시키고 환경 blocker를 정확히 기록한다.
- [x] 4.3 저장소 정책에 따라 scope review, commit, push와 Ready PR을 준비한다.
- [ ] 4.4 Exact revision의 dev Effects Workflow, retry와 restart를 검증하고 Linear에 증거를 남긴다.
  - 2026-08-24 dev에서 remote ActivityPub Post에 Local-origin `🎉` Reaction을 생성·삭제했다.
    `reaction-create-effects:01a032d9-2188-7846-9b8f-34a481d02d28`은
    `createReactionNotificationActivity`와 `sendReactionActivity`를 완료했고,
    같은 Reaction identity의 delete Workflow는 `deleteReactionNotificationActivity`와
    `sendReactionUndoActivity`를 완료했다.
  - create는 `f72e6818fdbdfb2fa7f495f5261b8cb7582befca`, delete는 후속 dev revision
    `832c9ef2`에서 실행됐고 모든 Activity가 attempt 1로 끝났다. 따라서 단일 exact revision의 retry·restart
    검증이 아니며 사용자 요청에 따라 추가 failure injection과 Worker restart는 수행하지 않는다.
- [ ] 4.5 전체 task와 spec sync가 완료된 뒤 이 작업의 주 작업자가 OpenSpec archive를 수행한다.
