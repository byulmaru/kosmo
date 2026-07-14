## MODIFIED Requirements

### Requirement: PostContent GraphQL object

API는 게시글의 현재 콘텐츠를 GraphQL `PostContent` Node로 노출하고 versioned canonical document, 파생 Plain Text와 선택적 Content Warning을 제공해야 한다(MUST).

#### Scenario: 게시글 콘텐츠 조회

- **WHEN** 클라이언트가 게시글의 현재 콘텐츠를 조회한다
- **THEN** 시스템은 `PostContent` object를 반환한다
- **AND** `PostContent`는 `id`, `body`, `bodyText`, `contentWarning`, `createdAt` 필드를 포함한다
- **AND** `body.schemaVersion`은 저장된 schema version이다
- **AND** `body.document`는 서버가 검증하고 canonicalize한 document JSON이다
- **AND** `bodyText`는 저장값이 아니라 canonical document에서 결정적으로 파생된 호환 필드다
- **AND** `bodyText`는 text, hard break와 paragraph 경계를 보존한다
- **AND** `contentWarning`은 값이 없을 수 있다
- **AND** `PostContent`는 HTML 본문 필드를 노출하지 않는다

### Requirement: Plain Text post creation

로그인했고 active profile이 있는 사용자는 Plain Text UX의 `bodyText` 입력으로 versioned canonical document 게시글을 작성할 수 있어야 한다(MUST).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText` 문자열과 `visibility`로 `createPost` mutation을 호출한다
- **THEN** 시스템은 새 `post` 행을 생성한다
- **AND** 게시글 작성자는 현재 세션의 active profile이다
- **AND** 게시글 상태는 `ACTIVE`이다
- **AND** 게시글 공개 범위는 입력받은 `visibility` 값이다
- **AND** 시스템은 새 `post_content` 행을 생성한다
- **AND** `post.current_content_id`는 생성된 콘텐츠를 참조한다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 `Post`를 반환한다

#### Scenario: 본문 저장 형식

- **WHEN** 시스템이 Plain Text 게시글 콘텐츠를 저장한다
- **THEN** 시스템은 입력 문자열을 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 V1 canonical document와 schema version `1`을 저장한다
- **AND** trim된 Plain Text가 canonical document에서 다시 동일하게 projection된다
- **AND** 시스템은 Plain Text 또는 HTML을 별도 canonical 본문으로 저장하지 않는다

#### Scenario: 유효하지 않은 본문

- **WHEN** 클라이언트가 trim 결과가 비어 있거나 canonical document에서 파생한 Plain Text가 500자를 초과하는 `bodyText`로 `createPost` mutation을 호출한다
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

## ADDED Requirements

### Requirement: Versioned PostContent app rendering

유니버설 앱은 GraphQL `PostContent.body`의 versioned document를 제한된 native/web renderer로 표시하고 Plain Text composer 입력 계약을 유지해야 한다(MUST).

#### Scenario: document 우선 표시

- **WHEN** 앱이 게시글 콘텐츠를 표시한다
- **THEN** 앱은 `body.schemaVersion`과 `body.document`를 renderer에 전달한다
- **AND** 지원되는 V1 document는 paragraph, text, hard break와 안전한 link 의미를 보존한다
- **AND** 미지원 또는 유효하지 않은 document이면 `bodyText`를 Plain Text fallback으로 표시한다

#### Scenario: Plain Text composer 유지

- **WHEN** 사용자가 로컬 게시글을 작성한다
- **THEN** 앱은 기존 React Native `TextInput` Plain Text UX를 유지한다
- **AND** 앱은 `CreatePostInput.bodyText`를 제출한다
- **AND** 앱 bundle에서 document를 만들기 위해 ProseMirror runtime을 사용하지 않는다
