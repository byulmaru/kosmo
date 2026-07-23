## MODIFIED Requirements

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-423`, `PROD-424` 로그인했고 active profile이 있는 사용자는 Plain Text UX의 `bodyText` 입력과 선택적 concrete `Post` `replyParentId`로 versioned canonical document의 일반 Post 또는 Reply를 작성할 수 있어야 한다 (MUST).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText` 문자열과 `visibility`로 `createPost` mutation을 호출하고 `replyParentId`를 생략한다
- **THEN** 시스템은 새 `post` 행을 생성한다
- **AND** 게시글 작성자는 현재 세션의 active profile이다
- **AND** 게시글 상태는 `ACTIVE`이다
- **AND** 게시글 공개 범위는 입력받은 `visibility` 값이다
- **AND** 시스템은 새 `post_content` 행을 생성한다
- **AND** `post.current_content_id`는 생성된 콘텐츠를 참조한다
- **AND** `post.reply_parent_id`와 `post.repost_source_id`는 `null`이다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 `Post`를 반환한다

#### Scenario: Plain Text Reply 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, `visibility`와 조회 가능한 contentful Parent의 concrete `Post` global ID를 `replyParentId`로 제공한다
- **THEN** 시스템은 `current_content_id`와 입력 `reply_parent_id`를 가지고 `repost_source_id`는 `null`인 Active Post를 생성한다
- **AND** Reply의 공개 범위는 Parent와 독립적인 입력 `visibility` 값이다
- **AND** mutation은 일반 Post와 같은 `CreatePostPayload.post`로 생성된 단일 `Post`를 반환한다

#### Scenario: 본문 저장 형식

- **WHEN** 시스템이 Plain Text 게시글 또는 Reply 콘텐츠를 저장한다
- **THEN** 시스템은 입력 문자열을 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 summary `null`인 V1 canonical PostContent document를 저장한다
- **AND** trim된 Plain Text가 canonical document에서 다시 동일하게 projection된다
- **AND** 시스템은 Plain Text 또는 HTML을 별도 canonical 본문으로 저장하지 않는다

#### Scenario: 유효하지 않은 본문

- **WHEN** 클라이언트가 trim 결과가 비어 있거나 summary와 body에서 파생한 authored Plain Text 합계가 500자를 초과하는 입력으로 `createPost` mutation을 호출한다
- **THEN** 시스템은 validation code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: 인증되지 않은 작성 요청

- **WHEN** 인증 session이 없는 클라이언트가 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL 인증 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: active profile 없는 작성 요청

- **WHEN** 로그인한 클라이언트가 active profile 없이 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다
