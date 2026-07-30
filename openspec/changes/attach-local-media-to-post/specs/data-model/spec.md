## MODIFIED Requirements

### Requirement: 게시물과 콘텐츠 저장

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554. 시스템은 게시물 메타데이터와 게시물 콘텐츠 revision을 분리하여 저장하고, version, nullable Plain Text summary와 canonical ProseMirror body를 포함한 PostContent document JSON을 revision의 canonical 표현으로 사용해야 한다(MUST).

#### Scenario: 게시물 저장

- **WHEN** 게시물이 생성된다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, canonical versioned PostContent document JSON과 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다
- **AND** document는 nullable일 수 없고 V1 envelope는 exact `{ version: 1, summary: string | null, body: ProseMirrorDoc }` shape다
- **AND** V1 summary는 nullable Plain Text Content Warning이고 body와 같은 revision의 authored content다
- **AND** 시스템은 summary, 파생 Plain Text나 실행 가능한 HTML 본문을 별도 canonical 값으로 저장하지 않는다

#### Scenario: V1 Media node 저장

- **WHEN** 새 PostContent가 하나 이상의 Media와 함께 생성된다
- **THEN** V1 body는 최대 4개의 block Media node를 포함할 수 있다
- **AND** 각 Media node attrs는 Media identity와 nullable Alt Text만 가진다
- **AND** body 안의 Media node 위치가 표시 순서를 결정한다
- **AND** document root의 optional Sensitive Media attr는 모든 Media node에 적용되며 생략하면 `false`다
- **AND** Media identity, Alt Text, 순서와 Sensitive Media를 별도 Post-Media relation, Media ID 배열, Post column 또는 Media column에 중복 저장하지 않는다

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

#### Scenario: 비프로덕션 기존 게시물 migration

- **WHEN** Plain Text 저장 계약의 기존 `post`와 `post_content`가 있는 비프로덕션 DB에 V1 document migration을 적용한다
- **THEN** 시스템은 기존 `post`와 `post_content` 행을 모두 삭제한다
- **AND** `post.current_content_id` 참조 순서 때문에 migration이 실패하지 않는다
- **AND** `body_text`와 `content_warning` 컬럼을 제거하고 non-null `document` JSONB 컬럼을 추가한다
- **AND** migration 후 기존 게시물 또는 고아 콘텐츠가 남지 않는다
