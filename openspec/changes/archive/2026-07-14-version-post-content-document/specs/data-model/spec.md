## MODIFIED Requirements

### Requirement: 게시물과 콘텐츠 저장

시스템은 게시물 메타데이터와 게시물 콘텐츠 revision을 분리하여 저장하고, version, nullable Plain Text summary와 canonical ProseMirror body를 포함한 PostContent document JSON을 revision의 canonical 표현으로 사용해야 한다(MUST).

#### Scenario: 게시물 저장

- **WHEN** 게시물이 생성된다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, canonical versioned PostContent document JSON과 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다
- **AND** document는 nullable일 수 없고 V1은 exact `{ version: 1, summary: string | null, body: ProseMirrorDoc }` shape다
- **AND** V1 summary는 nullable Plain Text Content Warning이고 body와 같은 revision의 authored content다
- **AND** 시스템은 summary, 파생 Plain Text나 실행 가능한 HTML 본문을 별도 canonical 값으로 저장하지 않는다
- **AND** JSON 안의 entity reference는 DB foreign key를 대체하지 않으며 필요한 relation projection은 같은 transaction에서 저장되고 canonical document로부터 재구축 가능해야 한다

#### Scenario: 비프로덕션 기존 게시물 migration

- **WHEN** Plain Text 저장 계약의 기존 `post`와 `post_content`가 있는 비프로덕션 DB에 V1 document migration을 적용한다
- **THEN** 시스템은 기존 `post`와 `post_content` 행을 모두 삭제한다
- **AND** `post.current_content_id` 참조 순서 때문에 migration이 실패하지 않는다
- **AND** `body_text`와 `content_warning` 컬럼을 제거하고 non-null `document` JSONB 컬럼을 추가한다
- **AND** migration 후 기존 게시물 또는 고아 콘텐츠가 남지 않는다
