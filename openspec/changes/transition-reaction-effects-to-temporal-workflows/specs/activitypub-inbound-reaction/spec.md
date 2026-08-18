## ADDED Requirements

### Requirement: Inbound Reaction mapping commit 뒤 Effects Workflow

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/architecture/core-services.md`, `PROD-723` — 시스템은 verified Like·EmojiReact의 activity URI mapping과 Reaction 생성, verified Undo의 mapping과 Reaction 삭제를 기존처럼 각각 같은 Core transaction에 저장해야 한다(MUST). 실제 Reaction transition이 함께 commit된 경우에만 transaction 반환 뒤 ActivityPub-origin Effects Workflow 시작을 시도해야 한다(MUST).

#### Scenario: 새 inbound Reaction과 mapping

- **WHEN** verified Like 또는 EmojiReact가 새 Reaction과 activity URI mapping을 같은 transaction에 commit한다
- **THEN** Core는 ActivityPub-origin Create Effects Workflow 시작을 시도한다
- **AND** adapter는 database handle이나 `postCommit`을 조립하지 않는다

#### Scenario: 기존 Reaction에 새 URI mapping

- **WHEN** verified activity가 기존 Reaction에 새 mapping만 commit한다
- **THEN** 시스템은 결과를 mapped-only 성공으로 유지한다
- **AND** Create Effects Workflow나 누락 Notification backfill을 시작하지 않는다

#### Scenario: inbound Undo

- **WHEN** verified Undo가 정확한 mapping과 Reaction을 같은 transaction에서 실제 삭제한다
- **THEN** Core는 ActivityPub-origin Delete Effects Workflow 시작을 시도한다
- **AND** outbound Undo echo를 만들지 않는다

#### Scenario: 중복 또는 충돌 activity URI

- **WHEN** 같은 activity URI가 동일 identity로 재전달되거나 다른 identity로 충돌한다
- **THEN** 기존 duplicate 또는 rejection 결과를 유지한다
- **AND** 새 Effects Workflow를 시작하지 않는다
