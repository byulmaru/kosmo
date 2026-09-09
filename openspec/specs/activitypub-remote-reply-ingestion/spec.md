# activitypub-remote-reply-ingestion Specification

## Purpose

원격 ActivityPub `Create(Note)`의 `inReplyTo`를 저장된 Post identity와 기존 Reply Parent 관계로 materialize하고, 현재 연결할 수 없는 Parent는 향후 lifecycle을 열어 둔 채 top-level Post로 보존하기 위한 요구사항을 정의한다.

## Requirements

### Requirement: 원격 Reply identity 검증

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-358, PROD-509의 2026-09-09 사용자 확정. 시스템은 원격 Note ingestion을 통과해 Reply projection 대상으로 전달된 `Note`가 `inReplyTo`를 제공하면 정확히 하나로 해석되는 HTTP(S) URI를 Reply Parent identity로 사용해야 한다(MUST). Note의 object identity와 attribution은 기존 원격 Note ingestion 계약을 그대로 통과해야 한다(MUST).

#### Scenario: 유효한 원격 Reply identity

- **WHEN** object identity와 attribution이 Create actor와 일치하고 원격 Note ingestion을 통과해 Reply projection 대상으로 전달된 Note가 단일 HTTP(S) `inReplyTo` URI를 제공한다
- **THEN** 시스템은 그 URI를 저장된 Reply Parent 해석 입력으로 사용한다

#### Scenario: 모호하거나 지원하지 않는 Parent identity

- **WHEN** 원격 Note ingestion을 통과해 Reply projection 대상으로 전달된 Note의 `inReplyTo`가 없지 않으면서 여러 URI로 해석되거나 HTTP(S)가 아닌 URI다
- **THEN** 시스템은 그 Note를 Reply Parent 관계 없는 top-level Post로 materialize한다

#### Scenario: 신규 PUBLIC/UNLISTED Reply 원문 identity

- **WHEN** PROD-509가 요청 URI와 Note ID, 단일 attribution 및 Source 자신의 작성자·PUBLIC/UNLISTED audience를 검증한 Note에 단일 HTTP(S) `inReplyTo`가 있다
- **THEN** 시스템은 해당 URI를 기존 DB Parent identity lookup 입력으로 사용한다
- **AND** Create의 actor와 attribution 일치 조건은 기존 Create 진입점에서 그대로 검증한다
- **AND** Parent나 Parent 작성자를 Source identity 또는 작성자로 대체하지 않는다

### Requirement: 저장된 ActivityPub Post를 Reply Parent로 해석

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-358, PROD-494, PROD-509. 시스템은 `inReplyTo`가 가리키는 저장된 Local 또는 Remote ActivityPub Post identity를 기존 Post로 해석해야 하며(MUST), URI에서 Post를 찾는 identity lookup은 Post의 현재 Content 보유 여부와 독립적이어야 한다(MUST). Content가 있는 Post만 Reply Parent로 허용하는 검증은 기존 Post 생성 계약을 따라야 한다(MUST). `inReplyTo`는 Repost Source로 해석하거나 별도 raw Parent source of truth로 저장해서는 안 된다(MUST NOT).

#### Scenario: 저장된 Local Parent

- **WHEN** `inReplyTo`가 configured Local Instance의 canonical `/ap/note/{postId}` identity이고 해당 Post에 Content가 있다
- **THEN** 시스템은 그 Post ID를 원격 Reply의 `replyParentId`로 사용한다

#### Scenario: 저장된 Remote Parent

- **WHEN** `inReplyTo`가 기존 ActivityPub Post mapping의 exact remote URI이고 해당 Post에 Content가 있다
- **THEN** 시스템은 mapping이 참조하는 Post ID를 원격 Reply의 `replyParentId`로 사용한다

#### Scenario: Content 없는 Repost Parent

- **WHEN** 해석된 Post가 자체 Content 없는 Repost다
- **THEN** 시스템은 그 Post를 Reply Parent로 연결하지 않는다
- **AND** 원격 Note 자체는 Reply Parent 관계 없는 top-level Post로 materialize한다

### Requirement: 현재 저장 상태에서 해석할 수 없는 Parent의 top-level fallback

**Authority / Provenance:** `docs/domain/objects/post.md`의 원격 Note 최초 materialization, PROD-358 및 2026-07-27 구현 결정 댓글, PROD-509·PROD-506의 2026-09-09 사용자 확정. 이 변경 범위에서 시스템은 `inReplyTo` Parent를 현재 저장된 ActivityPub Post identity로 해석할 수 없거나 Reply Parent로 사용할 수 없으면 원격 Note를 Reply Parent 관계 없는 top-level Post로 materialize해야 한다(MUST). 수신 처리 중 Parent를 원격 fetch하거나 재귀 materialize해서는 안 된다(MUST NOT). 이 계약은 기존 Create와 PROD-509의 최초 materialization에 모두 적용해야 한다(MUST). DB 장애와 예상하지 못한 오류를 null fallback으로 처리해서는 안 된다(MUST NOT). Parent fetch·재귀 materialization·기존 관계 update/backfill 및 복구 대상 식별 근거는 PROD-506의 후속 범위이며 최초 저장의 blocker가 아니다. raw `inReplyTo` 미보존으로 자동 복구는 보장되지 않는다.

#### Scenario: 아직 저장되지 않은 Parent

- **WHEN** 유효한 `inReplyTo` URI에 대응하는 저장된 Post가 없다
- **THEN** 시스템은 현재 delivery에서 Content와 ActivityPub mapping을 가진 top-level Post를 생성한다
- **AND** `replyParentId`를 설정하지 않는다
- **AND** Parent에 대한 network fetch를 수행하지 않는다

#### Scenario: Parent 저장 뒤 duplicate 재전달

- **WHEN** 앞선 delivery에서 Parent가 없어 top-level Post로 저장됐고 Parent 저장 뒤 같은 Create가 다시 전달된다
- **THEN** 시스템은 first-write-wins에 따라 기존 top-level Post를 유지한다
- **AND** duplicate delivery만으로 `replyParentId`를 추가하지 않는다

#### Scenario: Parent-specific 실패만 fallback

- **WHEN** DB lookup 뒤 Parent가 사라졌거나 기존 Post 생성 계약상 부적합해져 Parent-specific 부재·`replyParentId` validation 실패가 발생한다
- **THEN** 시스템은 기존 계약에 따라 `replyParentId = null`로 Note 자체의 최초 저장을 시도한다
- **AND** Parent fetch나 재귀 materialization은 하지 않는다

#### Scenario: DB 장애와 예상하지 못한 오류

- **WHEN** Parent lookup 또는 저장 중 DB 장애나 Parent 부재·부적합에 해당하지 않는 오류가 발생한다
- **THEN** 시스템은 오류를 전파하고 Parent 없는 정상 저장으로 재시도하지 않는다
- **AND** 실패한 transaction의 부분 Post 결과를 남기지 않는다

### Requirement: 원격 Reply의 원자적 저장과 중복 보존

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-358, PROD-256, PROD-393, PROD-509. 시스템은 원격 Reply의 Post, Content, ActivityPub mapping과 `replyParentId`를 하나의 ingestion transaction에서 저장해야 한다(MUST). 같은 object URI의 duplicate Create 또는 PROD-509 materialization은 최초 저장된 Reply Parent 관계를 변경해서는 안 된다(MUST NOT).

#### Scenario: 원격 Reply 저장 성공

- **WHEN** 유효한 remote Reply의 Parent가 Content 있는 Post로 해석된다
- **THEN** 시스템은 `currentContentId`와 `replyParentId`가 모두 있는 기존 단일 Post 구조를 원자적으로 저장한다
- **AND** `repostSourceId`를 설정하지 않는다

#### Scenario: duplicate Create

- **WHEN** 이미 materialize된 원격 Reply와 같은 object URI의 Create가 다시 전달된다
- **THEN** 시스템은 추가 Post나 Content를 만들지 않는다
- **AND** 기존 `replyParentId`를 유지한다

#### Scenario: top-level fallback의 duplicate Create

- **WHEN** Parent를 해석하지 못해 top-level로 materialize된 원격 Note와 같은 object URI의 Create가 다시 전달된다
- **THEN** 시스템은 추가 Post나 Content를 만들지 않는다
- **AND** 기존의 nullable `replyParentId`를 변경하지 않는다

#### Scenario: 저장 실패 rollback

- **WHEN** Reply materialization transaction 중 Post, Content, mapping 또는 Parent 관계 저장이 실패한다
- **THEN** 시스템은 해당 delivery의 부분 row를 남기지 않는다

#### Scenario: 신규 원문 조회의 duplicate와 concurrent first-write-wins

- **WHEN** Create 또는 PROD-509가 저장한 Reply와 동일한 object URI를 PROD-509가 다시 또는 동시에 materialize한다
- **THEN** 시스템은 object URI마다 하나의 Post로 수렴한다
- **AND** 최초 `replyParentId`가 null이어도 나중 입력으로 갱신하지 않는다
- **AND** Parent update/backfill은 실행하지 않는다

### Requirement: 기존 GraphQL Post 조회 계약 재사용

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-358, PROD-398. materialize된 원격 Reply는 기존 단일 GraphQL `Post` Node와 nullable `replyParent` field로 조회되어야 하며(MUST), 별도 Post Kind enum이나 Reply concrete type을 요구해서는 안 된다(MUST NOT).

#### Scenario: materialize된 원격 Reply 조회

- **WHEN** viewer가 기존 Post 조회 정책을 통과하는 materialize된 원격 Reply를 조회한다
- **THEN** GraphQL은 기존 `Post` Node의 Content와 `replyParent` 관계를 반환한다
