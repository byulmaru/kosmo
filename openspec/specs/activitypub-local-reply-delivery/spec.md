# activitypub-local-reply-delivery Specification

## Purpose

Local Reply의 생성과 삭제를 기존 canonical Note identity, visibility와 post-commit failure isolation 계약에 맞는
ActivityPub `Create(Note)`와 `Delete`로 원격 직접 Parent 작성자에게 전달하는 행동을 정의한다.

## Requirements

### Requirement: Local Reply Create delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-497. 시스템은 처음 commit된 Local Reply를 PROD-494의 canonical Local Note identity와 표현을 사용하는 ActivityPub `Create(Note)`로 remote recipient에게 전달해야 한다(MUST). `Create`의 Note는 Reply가 직접 참조하는 Local 또는
Remote Parent의 ActivityPub Post identity를 `inReplyTo`로 제공해야 한다(MUST).

#### Scenario: Local Parent에 대한 Reply 생성

- **WHEN** Local Profile이 Content가 있는 Local Post를 직접 Parent로 참조하는 Reply를 생성하고 transaction이 commit된다
- **THEN** Reply의 canonical Local Note에서 `inReplyTo`는 Parent의 `/ap/note/{postId}` identity를 가리킨다
- **AND** 이번 capability는 remote direct recipient가 없으므로 activity를 전달하지 않는다

#### Scenario: Remote Parent에 대한 Reply 생성

- **WHEN** Local Profile이 저장된 Remote Post를 직접 Parent로 참조하는 Reply를 생성하고 transaction이 commit된다
- **THEN** 시스템은 Reply의 canonical Local Note를 포함한 `Create(Note)`를 전달한다
- **AND** Note의 `inReplyTo`는 Parent의 기존 ActivityPub Post mapping URI를 가리킨다

#### Scenario: 동일 Reply의 Create 재호출

- **WHEN** 같은 committed Reply에 대한 Create delivery가 둘 이상 호출된다
- **THEN** 각 호출은 같은 Reply Note identity와 같은 안정적인 Create activity identity를 사용한다

### Requirement: Reply delivery recipient와 audience

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-497. 시스템은 Local Reply의 기존 Post Visibility audience를 유지하고, Public 또는 Unlisted Reply의 원격 직접 Parent 작성자를 direct recipient로 선택해야 한다(MUST). `inReplyTo` object IRI를 delivery endpoint로 취급해서는 안 된다(MUST NOT). 새 원격 요청이 허용되는 `ACTIVE` ActivityPub Instance의 저장된 HTTP(S) actor와 personal inbox만 전달에 사용해야 한다(MUST).

#### Scenario: Public 또는 Unlisted Reply recipient

- **WHEN** Public 또는 Unlisted Local Reply의 Create나 Delete를 전달한다
- **THEN** 직접 Parent의 Author가 remote Profile이면 follower 관계와 무관하게 direct recipient로 선택한다
- **AND** 저장된 유효한 HTTP(S) shared inbox가 있으면 Fedify가 우선할 수 있게 보존하고, 사용할 수 없으면 personal inbox를 사용한다

#### Scenario: Followers Only Reply recipient

- **WHEN** Followers Only Local Reply의 Create나 Delete를 전달한다
- **THEN** 시스템은 이번 capability에서 remote recipient를 선택하지 않는다
- **AND** follower 집합을 직접 조회하거나 fanout하지 않는다

#### Scenario: 지원하지 않는 Direct Reply

- **WHEN** Reply의 Visibility가 Direct이다
- **THEN** 시스템은 Reply Create 또는 Delete activity를 전달하지 않는다

#### Scenario: unavailable remote instance

- **WHEN** 후보 recipient의 ActivityPub Instance가 `UNRESPONSIVE` 또는 `SUSPENDED`이다
- **THEN** 시스템은 해당 recipient에게 activity를 전달하지 않는다
- **AND** 이번 capability를 위한 pending delivery, durable retry 또는 delivery history를 만들지 않는다

#### Scenario: 전달할 remote recipient가 없음

- **WHEN** visibility와 instance 정책을 통과한 remote recipient가 없다
- **THEN** 시스템은 remote delivery 없이 committed application 결과를 성공으로 유지한다

### Requirement: Local Reply Delete delivery

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-497. 시스템은 Local Reply가 Tombstone으로 commit된 뒤 생성 때 사용한 canonical Note identity를 object로 가리키는 ActivityPub `Delete`를 전달해야 한다(MUST). 같은 Reply의 Create와 Delete는 recipient별 순서를 보존할 수 있는
동일한 안정적 ordering domain을 사용해야 한다(MUST).

#### Scenario: Local Reply 삭제

- **WHEN** Author가 Active Local Reply를 삭제하고 Tombstone transaction이 commit된다
- **THEN** 시스템은 Reply 생성 때 사용한 canonical Note URI를 object로 가리키는 `Delete`를 전달한다
- **AND** Delete는 같은 Reply의 Create와 동일한 ordering domain을 사용한다

#### Scenario: 동일 Reply의 반복 삭제 또는 Delete 재호출

- **WHEN** 같은 Reply 삭제 action 또는 Delete delivery가 반복된다
- **THEN** 각 delivery는 같은 Note object identity와 같은 안정적인 Delete activity identity를 사용한다
- **AND** duplicate 억제를 위한 별도 delivery 상태를 저장하지 않는다

#### Scenario: Reply가 아닌 Post 삭제

- **WHEN** Reply Parent 관계가 없는 Local Post 또는 Content 없는 Repost가 삭제된다
- **THEN** 시스템은 이번 capability의 Reply Delete activity를 전달하지 않는다

### Requirement: Post-commit delivery failure isolation

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-447, PROD-497. 시스템은 Reply domain transaction이 commit된 뒤 기존 Fedify 경계로 activity를 직접 전달해야 한다(MUST).
Delivery 실패는 관측 가능하게 기록하되 이미 commit된 Reply 생성·삭제 또는 application 성공 결과를 실패로
바꾸거나 rollback해서는 안 된다(MUST NOT).

#### Scenario: Create delivery 실패

- **WHEN** Local Reply 생성 transaction이 commit된 뒤 remote HTTP Create delivery가 실패한다
- **THEN** 시스템은 실패와 Reply identity를 관측 가능하게 기록한다
- **AND** 생성된 Reply와 Content를 유지한다
- **AND** application action은 committed Reply를 나타내는 성공 결과를 반환한다

#### Scenario: Delete delivery 실패

- **WHEN** Local Reply 삭제 transaction이 commit된 뒤 remote HTTP Delete delivery가 실패한다
- **THEN** 시스템은 실패와 Reply identity를 관측 가능하게 기록한다
- **AND** Reply Tombstone과 삭제 시각을 유지한다
- **AND** application action은 committed 삭제를 나타내는 성공 결과를 반환한다

#### Scenario: transaction rollback

- **WHEN** Local Reply 생성 또는 삭제 transaction이 rollback된다
- **THEN** 시스템은 해당 state transition의 Create 또는 Delete activity를 전달하지 않는다

### Requirement: 현재 직접 delivery 제한

**Authority / Provenance:** PROD-448, PROD-497, PROD-512. 시스템은 이번 capability에서 followers fanout, transactional outbox, broker handoff, Fedify MessageQueue, durable retry 또는 사용자용 delivery status를 추가해서는 안 된다(MUST NOT). Commit과 직접 delivery 사이 process 종료로 activity가 유실될
수 있는 현재 제한은 PROD-448 migration 전까지 수용해야 한다(MUST).

#### Scenario: commit 직후 process 종료

- **WHEN** Reply state가 commit된 뒤 Fedify direct delivery가 시작되기 전에 API process가 종료된다
- **THEN** committed Reply state는 유지된다
- **AND** 이번 capability는 유실된 activity를 복원할 durable intent나 retry record를 제공하지 않는다
