## MODIFIED Requirements

### Requirement: Remote Media와 PostContent projection

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-585, PROD-625. 시스템은 검증된 원격 이미지 후보 각각을 원본 Remote Profile 소유의 별도 Ready Remote Media로 등록하고 같은 순서의 PostContent V1 Media node로 투영해야 한다(MUST). Remote URL을 Media identity나 재사용 key로 사용해서는 안 된다(MUST NOT).

#### Scenario: 최초 원격 이미지 투영

- **WHEN** 유효한 원격 Note의 이미지 attachment를 최초 materialize한다
- **THEN** 시스템은 Note 작성자 Remote Profile을 소유자로 하는 `REMOTE + READY` Media를 생성한다
- **AND** canonical 이미지 URL을 `media.url`에 저장한다
- **AND** nullable media type을 `media.mediaType`에 저장한다
- **AND** nullable attachment name을 `media.altText`에 저장한다
- **AND** 생성된 Media ID를 attachment 순서대로 PostContent Media node에 기록한다
- **AND** 별도 `remote_url` column이나 Post-Media 관계 테이블을 만들지 않는다

#### Scenario: 같은 URL의 서로 다른 attachment

- **WHEN** 같은 Remote Profile의 서로 다른 Note 또는 한 Note의 서로 다른 attachment가 같은 canonical URL을 사용한다
- **THEN** 시스템은 각 attachment를 별도 Remote Media identity로 등록한다
- **AND** 각 attachment의 nullable Media Type과 Alt Text를 서로 덮어쓰지 않고 보존한다
- **AND** duplicate Create는 새 Media를 만들거나 기존 Media metadata를 갱신하지 않는다

#### Scenario: 다른 작성자의 공용 URL

- **WHEN** canonical URL이 같은 Remote Media가 다른 Remote Profile에 이미 존재한다
- **THEN** 시스템은 현재 Note attachment를 위한 별도 Remote Media를 생성한다
- **AND** 기존 Media의 Profile과 참조를 변경하지 않는다

#### Scenario: attachment-only Note 투영

- **WHEN** 원격 Note 본문은 없지만 하나 이상의 유효한 이미지 후보가 있다
- **THEN** 시스템은 canonical empty paragraph와 순서 있는 Media node를 가진 PostContent를 저장한다
