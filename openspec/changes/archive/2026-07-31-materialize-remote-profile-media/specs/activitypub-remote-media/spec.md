## MODIFIED Requirements

### Requirement: Remote Media와 PostContent projection

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-585, PROD-625. 시스템은 검증된 원격 이미지 후보를 원본 Remote Profile 소유의 Ready Remote Media로 등록하고 같은 순서의 PostContent V1 Media node로 투영해야 한다(MUST). Remote Media identity는 원본 Remote Profile과 canonical URL의 조합이어야 한다(MUST).

#### Scenario: 최초 원격 이미지 투영

- **WHEN** 유효한 원격 Note의 이미지 attachment URL에 대응하는 같은 작성자 소유 Remote Media가 없다
- **THEN** 시스템은 Note 작성자 Remote Profile을 소유자로 하는 `REMOTE + READY` Media를 생성한다
- **AND** canonical 이미지 URL을 `media.url`에 저장한다
- **AND** nullable media type을 `media.mediaType`에 저장한다
- **AND** nullable attachment name을 `media.altText`에 저장한다
- **AND** 생성된 Media ID를 attachment 순서대로 PostContent Media node에 기록한다
- **AND** 별도 `remote_url` column이나 Post-Media 관계 테이블을 만들지 않는다

#### Scenario: 같은 작성자의 기존 Remote Media 재사용

- **WHEN** 같은 canonical URL과 같은 Remote Profile의 Remote Media가 이미 있다
- **THEN** 시스템은 새 Media를 만들지 않고 기존 Media identity를 PostContent Media node에서 재사용한다
- **AND** 새 object의 attachment name은 기존 Media의 Alt Text를 갱신한다
- **AND** 기존 Media의 URL, media type과 Profile은 갱신하지 않는다
- **AND** duplicate Create는 Alt Text를 포함한 기존 Media metadata를 갱신하지 않는다

#### Scenario: 다른 작성자의 공용 URL

- **WHEN** canonical URL이 같은 Remote Media가 다른 Remote Profile에 이미 존재한다
- **THEN** 시스템은 현재 Note 작성자 소유의 별도 Remote Media를 생성하거나 재사용한다
- **AND** 기존 Media의 Profile과 참조를 변경하지 않는다

#### Scenario: attachment-only Note 투영

- **WHEN** 원격 Note 본문은 없지만 하나 이상의 유효한 이미지 후보가 있다
- **THEN** 시스템은 canonical empty paragraph와 순서 있는 Media node를 가진 PostContent를 저장한다
- **AND** 해당 Note를 contentless Note로 거부하지 않는다

#### Scenario: Media Type이 없는 Image 조회

- **WHEN** Media Type을 생략한 원격 Image에서 생성된 Ready Remote Media를 현재 PostContent가 참조한다
- **THEN** GraphQL `PostContent.media`는 해당 Media를 nullable Media Type과 함께 반환한다
- **AND** Media Type이 없다는 이유로 Media 목록 전체를 unavailable로 만들지 않는다

### Requirement: 최초 원격 Media materialization 원자성

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, PROD-585, PROD-256, PROD-625. 시스템은 Remote Media projection을 기존 원격 Post 최초 materialization의 PostgreSQL transaction과 first-write-wins 경계에 포함해야 한다(MUST).

#### Scenario: Media와 Post를 함께 commit

- **WHEN** Media가 있는 유효한 원격 Note object URI가 최초로 materialize된다
- **THEN** 시스템은 필요한 Remote Media, ActivityPub Post mapping, Post, first PostContent와 currentContent를 같은 transaction에서 commit한다
- **AND** 하나의 write라도 실패하면 이 delivery가 새로 만든 모든 row를 rollback한다

#### Scenario: duplicate Create first-write-wins

- **WHEN** 이미 materialize된 object URI의 Create가 다시 전달된다
- **THEN** 시스템은 기존 Post와 PostContent를 변경하지 않는다
- **AND** duplicate delivery 때문에 Media를 추가하거나 갱신하지 않는다

#### Scenario: concurrent URL과 object 충돌

- **WHEN** 같은 object URI 또는 같은 Remote Profile과 Remote Media URL을 포함한 최초 delivery가 동시에 실행된다
- **THEN** database uniqueness와 transaction 결과가 object URI당 Post 하나, Remote Profile과 canonical URL 조합당 Media 하나로 수렴한다
- **AND** conflict loser는 orphan Post, PostContent 또는 Media를 남기지 않는다
