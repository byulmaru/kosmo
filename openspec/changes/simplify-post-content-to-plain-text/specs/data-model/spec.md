## MODIFIED Requirements

### Requirement: 게시물과 콘텐츠 저장

시스템은 게시물 메타데이터와 게시물 본문 콘텐츠를 분리하여 저장하고, Plain Text를 게시글 본문의 canonical 표현으로 사용해야 한다(MUST).

#### Scenario: 게시물 저장

- **WHEN** 게시물이 생성된다
- **THEN** 시스템은 작성 프로필, 공개 범위, 게시물 상태, 선택적 현재 콘텐츠, 생성 시각, 선택적 삭제 시각을 저장한다
- **AND** 작성 프로필은 `profile.id`를 참조해야 한다

#### Scenario: 게시물 콘텐츠 저장

- **WHEN** 게시물 본문이 저장된다
- **THEN** 시스템은 게시물, canonical Plain Text 본문, 선택적 Content Warning, 생성 시각을 저장한다
- **AND** 게시물 콘텐츠는 `post.id`를 참조해야 한다
- **AND** 시스템은 TipTap JSON 또는 실행 가능한 HTML 본문을 저장하지 않는다

#### Scenario: 기존 게시물 콘텐츠 migration

- **WHEN** TipTap 저장 계약이 적용된 기존 `post_content` 행을 Plain Text 저장 계약으로 migration한다
- **THEN** 시스템은 기존 `body_text` 값을 수정하지 않고 canonical 본문으로 보존한다
- **AND** 시스템은 콘텐츠 revision ID, 게시물 연결, Content Warning과 생성 시각을 보존한다
- **AND** 시스템은 `body_json`과 `body_html` 컬럼을 제거한다
- **AND** 시스템은 `spoiler_text` 컬럼의 기존 값을 `content_warning`으로 보존한다
