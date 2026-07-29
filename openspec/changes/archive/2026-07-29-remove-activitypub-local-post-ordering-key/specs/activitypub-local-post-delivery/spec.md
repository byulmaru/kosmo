## MODIFIED Requirements

### Requirement: Author Local Instance identity

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/instance.md`, `docs/domain/objects/profile.md`,
`docs/domain/objects/post.md`, PROD-512. 시스템은 Local Post Create/Delete의 Fedify Context, actor URI, Note URI와 activity identity를 Author Profile이
연결된 Local Instance의 `canonicalOrigin`에서 파생해야 한다(MUST). deployment configured origin으로 Author
Instance identity를 대체해서는 안 된다(MUST NOT).

#### Scenario: configured origin과 다른 Author Instance

- **WHEN** configured Local Instance와 다른 Local Instance에 속한 Author의 Post Create 또는 Delete를 전달한다
- **THEN** signing context와 actor URI는 Author Local Instance를 사용한다
- **AND** Create/Delete는 같은 Author origin에서 파생한 canonical Note URI를 사용한다

### Requirement: 일반 Local Post Delete delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`,
`docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-512. 시스템은 Local content Post가 Tombstone으로 commit된 뒤 같은 canonical Note URI를 object로 가리키는 ActivityPub
`Delete`를 구성하고 공통 outbound dispatcher에 전달해야 한다(MUST).

#### Scenario: Root Post 삭제

- **WHEN** Author가 Active Local Root Post를 삭제하고 Tombstone transaction이 commit된다
- **THEN** 시스템은 생성 때 사용한 canonical Note URI를 object로 가리키는 `Delete`를 구성한다
- **AND** Author followers target을 사용한다

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
identity를 사용하게 해야 한다(MUST). 현재 direct delivery에 queue ordering key를 추가하거나 Create/Delete
전달 순서를 보장해서는 안 된다(MUST NOT).

#### Scenario: Create와 Delete 재호출

- **WHEN** 같은 committed Post의 Create 또는 Delete delivery가 둘 이상 호출된다
- **THEN** 같은 lifecycle kind의 호출은 동일한 activity ID를 사용한다
- **AND** dispatcher 호출은 ordering key를 제공하지 않는다

#### Scenario: Create와 Delete의 direct delivery 순서

- **WHEN** 같은 Post의 Create와 Delete가 MessageQueue 없는 direct delivery로 실행된다
- **THEN** 시스템은 recipient server에 도착하는 순서를 보장하지 않는다
- **AND** queue ordering 계약은 PROD-448 후속 범위로 유지한다
