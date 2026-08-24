## Why

Reaction 상태 transaction은 이미 Core가 동기적으로 소유하지만, Notification과 ActivityPub queue handoff는 process-local `postCommit`에 남아 있다. Commit 뒤 실패한 효과를 Worker restart와 Temporal Activity retry로 복구할 수 있도록 상태 전이는 유지하고 후속 효과만 Workflow로 이전해야 한다.

## What Changes

- 실제 Reaction 생성 commit 뒤에만 Reaction Create Effects Workflow를 시작한다.
- 실제 Reaction 물리 삭제 commit 뒤에만 Reaction Delete Effects Workflow를 시작한다.
- Notification과 Local-origin Like·EmojiReact·Undo queue handoff를 서로 독립적인 retry 경계로 실행한다.
- ActivityPub-origin 전이는 Notification lifecycle만 실행하고 outbound echo를 만들지 않는다.
- Local GraphQL caller와 ActivityPub adapter에서 Reaction용 database handle과 반환형 `postCommit` 조립을 제거한다.
- 기존 Reaction uniqueness, 삭제 ABA 허용, inbound activity mapping atomicity와 Fedify queue acceptance 경계를 유지한다.
- Transaction Activity, outbox, receipt, 새 DB projection·migration·row lock은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0016-reaction-selector-current-state.md`, `docs/design/reactions.md`, `docs/architecture/core-services.md`
- Linear Contract: `PROD-723`
- Linear Implementations: `PROD-722`, `PROD-448`, `PROD-499`, `PROD-413`, `PROD-419`

## Capabilities

### New Capabilities

- `temporal-reaction-effects`: Committed Reaction create/delete transition 뒤의 Notification과 ActivityPub queue handoff를 분리된 Effects Workflow로 재시도하는 계약

### Modified Capabilities

- `reaction`: 실제 생성·삭제 transition과 effects Workflow 시작 경계, caller-owned `postCommit` 제거
- `activitypub-inbound-reaction`: verified mapping transaction 뒤 Workflow 시작과 ActivityPub-origin outbound echo 억제
- `activitypub-outbound-reaction`: Local-origin Like·EmojiReact·Undo handoff의 Temporal Activity 소유권과 retry 경계
- `notification`: Reaction Notification 생성·정리의 Temporal Activity 소유권과 실패 격리
- `temporal-worker-runtime-foundation`: Reaction create/delete Workflow와 Activity 등록, retry·restart·drain 검증

## Impact

- Core Reaction service와 ActivityPub Reaction materialization 경계가 자체 transaction과 post-commit Workflow start를 소유한다.
- API와 Fedify caller의 공개 반환형에서 Reaction `postCommit`과 database handle이 사라진다.
- Worker에 Reaction create/delete Effects Workflow와 Notification·delivery Activity 등록이 추가된다.
- GraphQL schema와 Reaction UI, DB schema, Fedify MessageQueue consumer runtime, production rollout은 변경하지 않는다.
