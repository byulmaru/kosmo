## ADDED Requirements

### Requirement: Post GraphQL object

API는 활성 게시글을 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, 현재 콘텐츠, 공개 범위, 상태, 생성 시각을 제공해야 한다(MUST).

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** `content`는 게시글의 현재 콘텐츠를 가리킨다

#### Scenario: 비활성 게시글 object 조회

- **WHEN** 게시글 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

### Requirement: PostContent GraphQL object

API는 게시글의 현재 콘텐츠를 GraphQL `PostContent` Node로 노출하고 TipTap JSON 원본, Plain Text projection, 선택적 스포일러 텍스트를 제공해야 한다(MUST).

#### Scenario: 게시글 콘텐츠 조회

- **WHEN** 클라이언트가 게시글의 현재 콘텐츠를 조회한다
- **THEN** 시스템은 `PostContent` object를 반환한다
- **AND** `PostContent`는 `id`, `bodyJson`, `bodyText`, `spoilerText`, `createdAt` 필드를 포함한다
- **AND** `bodyJson`은 저장된 TipTap 문서 JSON 원본이다
- **AND** `spoilerText`는 값이 없을 수 있다

### Requirement: TipTap document post creation

로그인했고 active profile이 있는 사용자는 TipTap 문서 JSON 본문으로 새 게시글을 작성할 수 있어야 한다(MUST).

#### Scenario: TipTap 문서 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `content` TipTap 문서와 `visibility`로 `createPost` mutation을 호출한다
- **THEN** 시스템은 새 `post` 행을 생성한다
- **AND** 게시글 작성자는 현재 세션의 active profile이다
- **AND** 게시글 상태는 `ACTIVE`이다
- **AND** 게시글 공개 범위는 입력받은 `visibility` 값이다
- **AND** 시스템은 새 `post_content` 행을 생성한다
- **AND** `post.current_content_id`는 생성된 콘텐츠를 참조한다
- **AND** mutation은 생성된 `Post`를 반환한다

#### Scenario: 본문 저장 형식

- **WHEN** 시스템이 TipTap 문서 게시글 콘텐츠를 저장한다
- **THEN** 시스템은 입력 TipTap JSON 문서를 `bodyJson`으로 저장한다
- **AND** 시스템은 TipTap 문서에서 추출한 trim된 Plain Text projection을 `bodyText`로 저장한다
- **AND** 각 TipTap `paragraph` node는 Plain Text projection에서 줄바꿈으로 분리된다

#### Scenario: 허용되지 않은 TipTap node

- **WHEN** 클라이언트가 이번 변경에서 허용하지 않는 TipTap node 또는 mark를 포함한 `content`로 `createPost` mutation을 호출한다
- **THEN** 시스템은 validation 오류를 반환한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: 유효하지 않은 본문

- **WHEN** 클라이언트가 Plain Text projection이 비어 있거나 정책상 최대 길이를 초과하는 `content`로 `createPost` mutation을 호출한다
- **THEN** 시스템은 validation 오류를 반환한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: 인증되지 않은 작성 요청

- **WHEN** 인증 session이 없는 클라이언트가 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL 인증 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다

#### Scenario: active profile 없는 작성 요청

- **WHEN** 로그인한 클라이언트가 active profile 없이 `createPost` mutation을 호출한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** 게시글과 게시글 콘텐츠를 생성하지 않는다
