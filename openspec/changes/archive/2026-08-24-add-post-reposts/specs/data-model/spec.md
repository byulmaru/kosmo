## MODIFIED Requirements

### Requirement: 게시물과 콘텐츠 저장

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-389`, `PROD-394`, `PROD-461`, `PROD-554` 시스템은 게시물 메타데이터와 게시물 콘텐츠 revision을 분리하여 저장하고, version, nullable Plain Text summary와 canonical ProseMirror body를 포함한 PostContent document JSON을 revision의 canonical 표현으로 사용해야 한다(MUST). Repost와 Quote는 같은 nullable Repost Source self-reference를 사용해야 한다(MUST).

#### Scenario: 게시물 저장

- **WHEN** 게시물이 생성된다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 선택적 Repost Source, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다
- **AND** Repost Source는 `post.id`를 직접 참조해야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, canonical versioned PostContent document JSON과 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다
- **AND** document는 nullable일 수 없고 V1은 exact `{ version: 1, summary: string | null, body: ProseMirrorDoc }` shape다
- **AND** V1 summary는 nullable Plain Text Content Warning이고 body와 같은 revision의 authored content다
- **AND** 시스템은 summary, 파생 Plain Text나 실행 가능한 HTML 본문을 별도 canonical 값으로 저장하지 않는다
- **AND** JSON 안의 entity reference는 DB foreign key를 대체하지 않으며 owning canonical contract가 별도 relation projection을 요구할 때 그 projection은 같은 transaction에서 저장되고 canonical document로부터 재구축 가능해야 한다
- **AND** PostContent Media node는 canonical document가 소유하는 예외이므로 별도 relation projection을 중복 저장하지 않는다

#### Scenario: V1 Media node 저장

- **WHEN** 새 PostContent가 하나 이상의 Media와 함께 생성된다
- **THEN** V1 body는 최대 4개의 block Media node를 포함할 수 있다
- **AND** 각 Media node attrs는 Media identity만 가진다
- **AND** body 안의 Media node 위치가 표시 순서를 결정한다
- **AND** document root의 optional Sensitive Media attr는 모든 Media node에 적용되며 생략하면 `false`다
- **AND** Media identity와 순서는 PostContent document에, nullable Alt Text는 Media column에, Sensitive Media는 document root에 각각 한 번만 저장한다
- **AND** 별도 Post-Media relation, Media ID 배열 또는 Post Sensitive Media column을 만들지 않는다

#### Scenario: 기존 V1 document 호환

- **WHEN** Media node와 Sensitive Media attr가 없는 기존 V1 document를 읽거나 canonicalize한다
- **THEN** document는 계속 유효하다
- **AND** Sensitive Media는 `false`로 해석한다
- **AND** 기존 paragraph, text, hard break와 link 의미를 바꾸지 않는다
- **AND** Media node 추가만으로 document schema version을 올리지 않는다

#### Scenario: Media 참조 검증 경계

- **WHEN** PostContent를 생성할 때 body가 Media identity를 참조한다
- **THEN** application은 저장 전에 참조 Media의 존재와 현재 작성 권한을 검증한다
- **AND** PostContent Media 참조를 위한 별도 database foreign key projection을 만들지 않는다
- **AND** 과거 revision 참조를 깨뜨리는 Media 물리 삭제는 별도 lifecycle 계약 없이 제공하지 않는다

#### Scenario: Repost와 Quote의 공용 Source 저장

- **WHEN** Content 없는 Repost 또는 Content 있는 Quote가 생성된다
- **THEN** 시스템은 둘 모두 `post.repost_source_id`에 직접 Source Post ID를 저장한다
- **AND** 별도 Repost table, Quote Source column 또는 Post Kind column을 추가하지 않는다

#### Scenario: Active Repost 유일성

- **WHEN** 같은 Author Profile과 Repost Source 조합으로 Content와 Reply Parent가 없는 Active Repost를 둘 이상 저장하려 한다
- **THEN** 데이터베이스는 partial unique index로 중복 Active Repost를 거부한다
- **AND** Content가 있는 Quote와 Tombstone Repost는 같은 유일성 집합에 포함하지 않는다

#### Scenario: Repost Tombstone과 Source 관계 보존

- **WHEN** Active Repost가 Tombstone으로 전이된다
- **THEN** 시스템은 `repost_source_id`를 지우거나 다른 Post로 바꾸지 않는다
- **AND** 해당 Author와 Source 조합으로 새 Active Repost를 저장할 수 있다

#### Scenario: Source Tombstone 관계 보존

- **WHEN** Repost 또는 Quote가 직접 참조하는 Source Post가 Tombstone으로 전이된다
- **THEN** 데이터베이스는 Repost와 Quote 행 및 `repost_source_id`를 보존한다
- **AND** 조회 계층은 Content 없는 Repost와 Content 있는 Quote의 조회 정책을 구분하면서 조회 불가능한 Source 관계를 표시하지 않는다

#### Scenario: Repost Source additive migration

- **WHEN** 기존 Post 행이 있는 데이터베이스에 Repost Source migration을 적용한다
- **THEN** 시스템은 nullable `repost_source_id` self-reference와 Active Repost partial unique index를 추가한다
- **AND** 기존 Post와 PostContent 행을 재작성하거나 삭제하지 않는다
- **AND** 기존 workload는 새 nullable column을 사용하지 않아도 계속 동작할 수 있다

#### Scenario: 비프로덕션 기존 게시물 migration

- **WHEN** Plain Text 저장 계약의 기존 `post`와 `post_content`가 있는 비프로덕션 DB에 V1 document migration을 적용한다
- **THEN** 시스템은 기존 `post`와 `post_content` 행을 모두 삭제한다
- **AND** `post.current_content_id` 참조 순서 때문에 migration이 실패하지 않는다
- **AND** `body_text`와 `content_warning` 컬럼을 제거하고 non-null `document` JSONB 컬럼을 추가한다
- **AND** migration 후 기존 게시물 또는 고아 콘텐츠가 남지 않는다

## ADDED Requirements

### Requirement: Repost Notification source projection 저장

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-416` 시스템은 기존 단일 Notification projection에서 Repost Post를 loose source로 사용하는 Repost Notification을 저장해야 한다(MUST).

#### Scenario: Repost Notification 행 저장

- **WHEN** 다른 Local Profile의 Post에 대한 새 Repost가 Notification source로 저장된다
- **THEN** 시스템은 기존 `notification` table에 `kind = REPOST`, `source_id = Source Repost Post.id`, Recipient Profile과 빈 kind-specific data를 저장한다
- **AND** Repost 전용 table, source foreign key 또는 Author·Source snapshot을 추가하지 않는다

#### Scenario: Repost Notification 유일성

- **WHEN** 같은 Recipient Profile, Repost kind와 Source Repost ID의 Notification을 반복 저장한다
- **THEN** 기존 Notification source uniqueness가 중복 projection을 거부한다
- **AND** 저장 경계는 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

#### Scenario: loose source lifecycle

- **WHEN** Source Repost가 Tombstone이 되거나 action 밖의 경로에서 source가 unavailable해진다
- **THEN** Notification 행과 Read State는 PROD-725 effects Workflow의 cleanup 완료 전이나 terminal failure 뒤에 남을 수 있다
- **AND** database cascade 또는 trigger가 source lifecycle을 대신하지 않는다
