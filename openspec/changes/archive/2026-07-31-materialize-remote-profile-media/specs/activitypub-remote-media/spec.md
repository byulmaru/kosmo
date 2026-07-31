## MODIFIED Requirements

### Requirement: 원격 이미지 attachment 검증

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/objects/post-content.md`, PROD-585, PROD-625. 시스템은 원격 Note에 embedded Image 또는 Media Type이 `image/*`인 embedded Document로 제공된 attachment만 Remote Media projection 후보로 사용하고, 후보 전체를 Post materialization 전에 검증해야 한다(MUST).

#### Scenario: 지원되는 이미지 attachment 수집

- **WHEN** 검증된 원격 Note가 embedded Image 또는 Media Type이 `image/*`인 embedded Document attachment를 가진다
- **THEN** 시스템은 Fedify vocabulary 객체를 사용해 attachment를 읽는다
- **AND** Image는 Media Type이 없어도 후보이며 Document는 Media Type의 MIME essence가 `image/*`일 때만 후보이다
- **AND** 각 후보는 canonical HTTP(S) 표현 URL을 정확히 하나 가져야 한다
- **AND** 시스템은 원본 nullable media type 문자열을 정규화하지 않고 그대로 보존한다
- **AND** 시스템은 nullable name 문자열을 Remote Media의 Alt Text로 보존한다
- **AND** attachment metadata나 byte를 위한 추가 원격 fetch를 수행하지 않는다

#### Scenario: 이미지 attachment가 4개를 초과함

- **WHEN** 지원 가능한 embedded 이미지 attachment가 5개 이상이다
- **THEN** 시스템은 원래 attachment 순서의 앞 4개만 Remote Media projection 후보로 사용한다
- **AND** 다섯 번째 이후 이미지 attachment는 Media row나 PostContent Media node를 만들지 않는다
- **AND** 초과 attachment만으로 Note 전체를 거부하지 않는다

#### Scenario: 지원하지 않는 attachment 무시

- **WHEN** Note attachment가 지원되는 embedded Image/Document가 아닌 다른 ActivityStreams 타입이거나 IRI-only reference다
- **THEN** 시스템은 해당 attachment를 Remote Media 후보에서 제외한다
- **AND** 지원하지 않는 attachment만 있다는 이유로 본문이 유효한 Note 전체를 거부하지 않는다

#### Scenario: 부적합 이미지 attachment가 있는 Note 거부

- **WHEN** 이미지 후보의 표현 URL이 없거나 둘 이상이다
- **OR** URL scheme이 HTTP(S)가 아니거나 canonicalize할 수 없다
- **THEN** 시스템은 앞 4개 후보 안의 부적합 attachment를 부분 투영하지 않는다
- **AND** 해당 Note의 ActivityPub Post mapping, Post, PostContent와 Media side effect를 모두 남기지 않는다

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

#### Scenario: concurrent object first-write-wins와 같은 URL의 독립 저장

- **WHEN** 같은 object URI의 delivery 또는 같은 Remote Media URL을 가진 서로 다른 object URI의 delivery가 동시에 실행된다
- **THEN** database uniqueness와 transaction 결과가 object URI당 Post 하나로 수렴한다
- **AND** 서로 다른 object URI에서 commit된 attachment는 URL이 같아도 각각 별도 Media identity를 가진다
- **AND** 같은 object URI의 conflict loser는 orphan Post, PostContent 또는 Media를 남기지 않는다
