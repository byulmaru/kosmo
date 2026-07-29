# activitypub-local-post-delivery Specification

## Purpose

Local content Post의 일반 ActivityPub Create 및 Delete delivery 계약을 정의한다.

## Requirements

### Requirement: 일반 Local Post Create delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`,
`docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494, PROD-512. 시스템은 처음 commit된 모든 Local content Post를 PROD-494의 canonical Local Note identity와 표현을 사용하는
일반 ActivityPub `Create(Note)`로 구성하고 공통 outbound dispatcher에 전달해야 한다(MUST). Reply 전용
Create builder나 delivery helper를 만들어서는 안 된다(MUST NOT).

#### Scenario: Root Post 생성

- **WHEN** Local Profile의 Content가 있는 Root Post 생성 transaction이 commit된다
- **THEN** 시스템은 canonical Local Note를 포함한 `Create(Note)`를 구성한다
- **AND** Note는 `inReplyTo`를 포함하지 않는다
- **AND** Author followers를 논리적 target으로 dispatcher에 전달한다

#### Scenario: Local Parent Reply 생성

- **WHEN** Local Profile이 Content가 있는 Local Post를 Parent로 참조하는 Reply를 생성하고 transaction이 commit된다
- **THEN** 시스템은 Root Post와 같은 Create builder를 사용한다
- **AND** Note의 `inReplyTo`는 Parent의 canonical Local Note URI다
- **AND** Parent author direct target을 추가하지 않는다

#### Scenario: Remote Parent Reply 생성

- **WHEN** Local Profile이 저장된 remote Post를 Parent로 참조하는 Public 또는 Unlisted Reply를 생성하고 transaction이 commit된다
- **THEN** 시스템은 Root Post와 같은 Create builder를 사용한다
- **AND** Note의 `inReplyTo`는 Parent의 기존 ActivityPub Post URI다
- **AND** Author followers와 remote Parent author Profile을 논리적 target으로 dispatcher에 전달한다

### Requirement: Local Post audience와 target 의미

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, PROD-512. 시스템은 PROD-494가 투영한 Post Visibility audience를 Activity에 유지하고, visibility와 Reply 관계에서 dispatcher에
넘길 논리적 target만 결정해야 한다(MUST). Object `inReplyTo` URI를 delivery endpoint로 사용해서는 안 된다(MUST NOT).

#### Scenario: Public 또는 Unlisted Post target

- **WHEN** Public 또는 Unlisted Local content Post의 Create나 Delete를 전달한다
- **THEN** Author followers를 target으로 포함한다
- **AND** remote Reply Parent가 있으면 Parent author Profile을 direct target으로 추가한다

#### Scenario: Followers Only Reply target

- **WHEN** Followers Only Local Reply의 Create나 Delete를 전달한다
- **THEN** Author followers만 target으로 포함한다
- **AND** Parent author를 visibility를 우회하는 direct target으로 추가하지 않는다

#### Scenario: 지원하지 않는 Direct Post

- **WHEN** Post Visibility가 현재 ActivityPub Local Note 계약에서 지원되지 않는다
- **THEN** 시스템은 Create 또는 Delete delivery를 구성하지 않는다
- **AND** recipient identity나 audience를 임의로 추정하지 않는다

### Requirement: Author Local Instance identity

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`,
`docs/domain/objects/post.md`, PROD-512. 시스템은 Local Post Create/Delete의 Fedify Context, actor URI, Note URI와 activity identity를 Author Profile이
연결된 Local Instance의 `canonicalOrigin`에서 파생해야 한다(MUST). deployment configured origin으로 Author
Instance identity를 대체해서는 안 된다(MUST NOT).

#### Scenario: configured origin과 다른 Author Instance

- **WHEN** configured Local Instance와 다른 Local Instance에 속한 Author의 Post Create 또는 Delete를 전달한다
- **THEN** signing context와 actor URI는 Author Local Instance를 사용한다
- **AND** Create/Delete는 같은 Author origin에서 파생한 canonical Note URI와 ordering domain을 사용한다

### Requirement: 일반 Local Post Delete delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`,
`docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-512. 시스템은 Local content Post가 Tombstone으로 commit된 뒤 같은 canonical Note URI를 object로 가리키는 ActivityPub
`Delete`를 구성하고 공통 outbound dispatcher에 전달해야 한다(MUST). 같은 Post의 Create와 Delete는 같은
stable ordering domain을 사용해야 한다(MUST).

#### Scenario: Root Post 삭제

- **WHEN** Author가 Active Local Root Post를 삭제하고 Tombstone transaction이 commit된다
- **THEN** 시스템은 생성 때 사용한 canonical Note URI를 object로 가리키는 `Delete`를 구성한다
- **AND** Author followers target과 Create와 동일한 ordering domain을 사용한다

#### Scenario: Reply 삭제

- **WHEN** Author가 Active Local Reply를 삭제하고 Tombstone transaction이 commit된다
- **THEN** 시스템은 Root Post와 같은 Delete builder를 사용한다
- **AND** Public 또는 Unlisted remote Reply이면 Author followers와 현재 Parent author Profile target을 사용한다

#### Scenario: Content 없는 Repost 삭제

- **WHEN** Content와 Reply Parent 없이 Repost Source만 가진 Repost가 삭제된다
- **THEN** 시스템은 Local Note Create 또는 Delete lifecycle을 실행하지 않는다
- **AND** Repost Announce/Undo lifecycle은 이 capability에서 변경하지 않는다

### Requirement: stable Local Post activity identity

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`,
`docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-512. 시스템은 별도 activity row 없이 같은 Local Post lifecycle의 중복 호출이 동일한 Create 또는 Delete activity
identity와 ordering key를 사용하게 해야 한다(MUST).

#### Scenario: Create와 Delete 재호출

- **WHEN** 같은 committed Post의 Create 또는 Delete delivery가 둘 이상 호출된다
- **THEN** 같은 lifecycle kind의 호출은 동일한 activity ID를 사용한다
- **AND** Create와 Delete는 fragment 없는 canonical Note URI를 같은 ordering key로 사용한다

### Requirement: Post lifecycle과 delivery failure isolation

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/architecture/core-services.md`, PROD-447, PROD-512, PROD-533. 통합 core `createPost`·`deletePost` action은 Local content Post lifecycle을 소유해야 하며(MUST), GraphQL resolver가
Fedify lifecycle을 직접 조립해서는 안 된다(MUST NOT). Top-level transaction commit 뒤 dispatcher를 직접
호출하고 delivery 실패는 committed application 결과와 격리해야 한다(MUST).

#### Scenario: Create 또는 Delete delivery 실패

- **WHEN** top-level Local Post 생성 또는 삭제 transaction이 commit된 뒤 dispatcher가 실패한다
- **THEN** 시스템은 Post identity와 실패를 관측 가능하게 기록한다
- **AND** committed Post·Content 또는 Tombstone 결과를 유지한다
- **AND** application action은 committed 결과를 나타내는 성공 결과를 반환한다

#### Scenario: transaction rollback

- **WHEN** Local Post 생성 또는 삭제 transaction이 rollback된다
- **THEN** 시스템은 해당 state transition의 Create 또는 Delete Activity를 외부에 전달하지 않는다

#### Scenario: caller-owned transaction의 현재 제한

- **WHEN** Local Post action이 caller transaction에 합류하고 committed-read delivery projection이 uncommitted Post를 찾지 못한다
- **THEN** 시스템은 rollback될 수 있는 Activity를 먼저 전달하지 않는다
- **AND** outer commit 뒤 delivery를 재실행하지 않아 발생하는 누락은 PROD-448 전까지 수용한다

### Requirement: 현재 direct delivery 제한

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: PROD-448, PROD-512, PROD-533. 시스템은 이번 capability에서 transactional outbox, broker handoff, Fedify MessageQueue, durable retry 또는 사용자용
delivery status를 추가해서는 안 된다(MUST NOT). Commit과 direct delivery 사이 process 종료로 Activity가 유실될
수 있는 현재 제한을 PROD-448 migration 전까지 수용해야 한다(MUST).

#### Scenario: commit 직후 process 종료

- **WHEN** Local Post state가 commit된 뒤 Fedify direct delivery가 시작되기 전에 API process가 종료된다
- **THEN** committed Post state는 유지된다
- **AND** 이번 capability는 유실된 Activity를 복원할 durable intent나 retry record를 제공하지 않는다
