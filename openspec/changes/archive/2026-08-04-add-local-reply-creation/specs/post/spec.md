## MODIFIED Requirements

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-424`, `PROD-461`, `PROD-554` 로그인했고 active profile이 있는 사용자는 Plain Text UX의 `bodyText`, 선택적 Media item과 Sensitive Media, 선택적 concrete `Post` `replyParentId`로 versioned canonical document의 일반 Post 또는 Reply를 작성할 수 있어야 한다(MUST). selected Profile은 Local 또는 Remote일 수 있으며(MUST), GraphQL `usingProfile` entry point가 보장한 Active Account, membership과 selected Profile 조회 가능 상태를 resolver가 중복 검증하면 안 된다(MUST NOT).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, `visibility`, 최대 4개의 선택적 `{ mediaId, altText }` item과 `sensitiveMedia`로 `createPost` mutation을 호출하고 `replyParentId`를 생략한다
- **THEN** 시스템은 새 `post` 행을 생성한다
- **AND** 게시글 작성자는 현재 세션의 active profile이다
- **AND** 게시글 상태는 `ACTIVE`이다
- **AND** 게시글 공개 범위는 입력받은 `visibility` 값이다
- **AND** 시스템은 새 `post_content` 행을 생성한다
- **AND** `post.current_content_id`는 생성된 콘텐츠를 참조한다
- **AND** Post와 첫 PostContent는 같은 transaction에서 생성되며 하나라도 실패하면 함께 rollback한다
- **AND** Media item은 입력 순서의 V1 Media node가 되고 Sensitive Media는 document root attr가 된다
- **AND** `post.reply_parent_id`와 `post.repost_source_id`는 `null`이다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 `Post`를 반환한다

#### Scenario: Remote selected Profile로 게시글 작성

- **WHEN** Active Account의 Member인 Active/Normal Remote Profile이 selected Profile인 상태에서 유효한 입력으로 `createPost`를 호출한다
- **THEN** 시스템은 selected Profile을 Author로 하는 Post를 생성한다
- **AND** Media의 Profile이 selected Profile과 달라도 Upload Account가 같으면 허용한다
- **AND** selected Profile 또는 Media Profile의 Instance Type만으로 요청을 거부하지 않는다

#### Scenario: Plain Text Reply 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText` 또는 Media item, `visibility`, 선택적 `sensitiveMedia`와 조회 가능한 contentful Parent의 concrete `Post` global ID를 `replyParentId`로 제공한다
- **THEN** 시스템은 `current_content_id`와 입력 `reply_parent_id`를 가지고 `repost_source_id`는 `null`인 Active Post를 생성한다
- **AND** Reply의 공개 범위는 Parent와 독립적인 입력 `visibility` 값이다
- **AND** 입력 Media item과 Sensitive Media는 일반 Post와 같은 PostContent document 계약을 따른다
- **AND** mutation은 일반 Post와 같은 `CreatePostPayload.post`로 생성된 단일 `Post`를 반환한다

#### Scenario: 본문과 Media 저장 형식

- **WHEN** 시스템이 Plain Text와 선택적 Media item으로 게시글 또는 Reply 콘텐츠를 저장한다
- **THEN** 시스템은 입력 문자열을 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 paragraph content 다음에 입력 순서의 Media block node를 추가하고 summary `null`인 V1 canonical PostContent document를 저장한다
- **AND** trim된 Plain Text가 canonical document에서 다시 동일하게 projection된다
- **AND** persistence document의 Media node는 검증된 Media DB identity만 저장한다
- **AND** 같은 transaction에서 Media가 nullable Alt Text를 저장하고 document root가 Sensitive Media를 저장한다
- **AND** 시스템은 Plain Text, HTML 또는 Media ID 배열을 별도 canonical 값으로 저장하지 않는다

#### Scenario: Media-only Post 또는 Reply

- **WHEN** trim한 bodyText가 비어 있지만 하나 이상의 유효한 Media item이 입력된다
- **THEN** 시스템은 빈 paragraph와 Media node를 가진 PostContent를 생성한다
- **AND** bodyText projection은 빈 문자열이다

#### Scenario: 유효하지 않은 본문과 Media 조합

- **WHEN** 클라이언트가 trim한 bodyText와 Media item이 모두 없거나 summary와 body에서 파생한 authored Plain Text 합계가 500자를 초과하는 입력으로 `createPost` mutation을 호출한다
- **THEN** 시스템은 validation code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: 유효하지 않은 Media item

- **WHEN** Media item에 중복, 5개 이상, 없는 Media, Uploading Media, Remote Media 또는 다른 Upload Account의 Media가 포함된다
- **THEN** 시스템은 Media 존재·state·소유권 차이를 노출하지 않는 validation 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 부분 저장하지 않는다

#### Scenario: 인증되지 않은 작성 요청

- **WHEN** 인증 session이 없는 클라이언트가 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL 인증 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: active profile 없는 작성 요청

- **WHEN** 로그인한 클라이언트가 active profile 없이 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다
