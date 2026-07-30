## MODIFIED Requirements

### Requirement: PostContent GraphQL object

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554. API는 게시글의 현재 콘텐츠를 GraphQL `PostContent` Node로 노출하고 versioned PostContent document와 파생 호환 필드를 제공해야 한다(MUST).

#### Scenario: 게시글 콘텐츠 조회

- **WHEN** 클라이언트가 게시글의 현재 콘텐츠를 조회한다
- **THEN** 시스템은 `PostContent` object를 반환한다
- **AND** `PostContent`는 `id`, `document`, `bodyText`, `contentWarning`, `createdAt` 필드를 포함한다
- **AND** `document`는 서버가 검증하고 canonicalize한 `{ version, summary, body }` JSON이다
- **AND** GraphQL document의 Media node는 내부 DB UUID가 아니라 해당 Media global ID를 제공한다
- **AND** `bodyText`는 저장값이 아니라 `document.body`의 text, hard break와 paragraph 경계에서 결정적으로 파생되며 Media node를 텍스트로 추가하지 않는다
- **AND** `contentWarning`은 저장값이 아니라 `document.summary`를 노출하는 nullable 호환 필드다
- **AND** `PostContent`는 HTML 본문이나 raw Media storage reference를 노출하지 않는다

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554. 로그인했고 active profile이 있는 사용자는 Plain Text `bodyText`, 선택적인 Media item과 Sensitive Media로 V1 canonical document Post를 작성할 수 있어야 한다(MUST). selected Profile은 Local 또는 Remote일 수 있으며(MUST), GraphQL `usingProfile` entry point가 보장한 Active Account, membership과 selected Profile 조회 가능 상태를 resolver가 중복 검증하면 안 된다(MUST NOT).

#### Scenario: Plain Text와 Media 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, `visibility`, 최대 4개의 선택적 `{ mediaId, altText }` item과 `sensitiveMedia`로 `createPost`를 호출한다
- **THEN** 시스템은 현재 active profile이 작성한 `ACTIVE` Post와 첫 PostContent를 생성한다
- **AND** Post의 공개 범위는 입력받은 `visibility` 값이다
- **AND** `post.current_content_id`는 생성된 PostContent를 참조한다
- **AND** Media item은 입력 순서의 V1 Media node가 되고 Sensitive Media는 document root attr가 된다
- **AND** 각 item의 nullable Alt Text는 같은 transaction에서 해당 Media에 저장된다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 Post를 반환한다

#### Scenario: Remote selected Profile로 게시글 작성

- **WHEN** Active Account의 Member인 Active/Normal Remote Profile이 selected Profile인 상태에서 유효한 입력으로 `createPost`를 호출한다
- **THEN** 시스템은 selected Profile을 Author로 하는 Post를 생성한다
- **AND** Media의 Profile이 selected Profile과 달라도 Upload Account가 같으면 허용한다
- **AND** selected Profile 또는 Media Profile의 Instance Type만으로 요청을 거부하지 않는다

#### Scenario: 본문과 Media 저장 형식

- **WHEN** 시스템이 Plain Text와 Media item으로 PostContent를 저장한다
- **THEN** 시스템은 bodyText를 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 paragraph content 다음에 입력 순서의 Media block node를 추가한다
- **AND** summary는 `null`이다
- **AND** persistence document의 Media node는 검증된 Media DB identity만 저장한다
- **AND** Media가 nullable Alt Text를 저장하고 document root가 Sensitive Media를 저장한다
- **AND** Plain Text, HTML 또는 Media ID 배열을 두 번째 canonical 값으로 저장하지 않는다

#### Scenario: Media-only Post

- **WHEN** trim한 bodyText가 비어 있지만 하나 이상의 유효한 Media item이 입력된다
- **THEN** 시스템은 빈 paragraph와 Media node를 가진 첫 PostContent를 생성한다
- **AND** bodyText projection은 빈 문자열이다

#### Scenario: 유효하지 않은 본문과 Media 조합

- **WHEN** trim한 bodyText와 Media item이 모두 없거나 summary와 body의 authored Plain Text 합계가 500자를 초과한다
- **THEN** 시스템은 validation code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** Post와 PostContent를 생성하지 않는다

#### Scenario: 유효하지 않은 Media item

- **WHEN** Media item에 중복, 5개 이상, 없는 Media, Uploading Media, Remote Media 또는 다른 Upload Account의 Media가 포함된다
- **THEN** 시스템은 Media 존재·state·소유권 차이를 노출하지 않는 validation 오류로 요청을 거부한다
- **AND** Post와 PostContent를 부분 저장하지 않는다

#### Scenario: 인증되지 않았거나 active profile 없는 작성 요청

- **WHEN** 유효한 session 또는 active profile 없이 `createPost`를 호출한다
- **THEN** 시스템은 GraphQL 인증 또는 active profile scope 오류로 요청을 거부한다
- **AND** Post와 PostContent를 생성하지 않는다

### Requirement: Plain Text post composer component

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, PROD-461, PROD-553. 유니버설 앱은 Profile fragment ref를 받는 React Native Post Composer에서 Plain Text와 최대 4개 이미지의 업로드·작성 상태를 함께 관리해야 한다(MUST). 본문 작성에는 TipTap, ProseMirror runtime 또는 WebView editor를 포함하면 안 된다(MUST NOT).

#### Scenario: 작성 컴포넌트 fragment 계약

- **WHEN** 부모 query가 Post 작성에 사용할 active profile을 조회한다
- **THEN** Composer는 자기 Profile fragment와 `ProfileNameBlock_profile` fragment를 spread한다
- **AND** 개별 profile scalar가 아닌 fragment ref prop을 받는다

#### Scenario: 작성 폼 표시

- **WHEN** Composer가 유효한 active profile과 함께 렌더링된다
- **THEN** 앱은 Plain Text 입력, 이미지 추가 action, 공개 범위, 남은 글자수와 게시 action을 표시한다
- **AND** 선택 이미지의 preview, upload 상태, 제거 action과 nullable Alt Text 입력을 표시한다
- **AND** 이미지가 있으면 Sensitive Media control을 표시한다
- **AND** interactive control은 플랫폼 target, accessible name, disabled·busy·error state를 제공한다

#### Scenario: 제출 가능 상태

- **WHEN** 본문 또는 하나 이상의 Ready Media가 있고 다른 선택 이미지가 upload 중·실패 상태가 아니며 본문 길이가 유효하다
- **THEN** 게시 action을 활성화한다
- **AND** 그 밖의 상태에서는 게시 action을 비활성화한다

### Requirement: Plain Text post submission

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, PROD-461, PROD-553, PROD-554. 유니버설 앱은 Composer의 Plain Text, Ready Media global ID와 nullable Alt Text 순서, Sensitive Media를 `createPost` mutation에 제출해야 한다(MUST).

#### Scenario: 본문 또는 Media Post 작성 성공

- **WHEN** Composer가 유효한 본문 또는 Ready Media와 함께 제출된다
- **THEN** 앱은 bodyText, visibility, 순서 있는 `{ mediaId, altText }` item과 Sensitive Media를 `createPost` input으로 보낸다
- **AND** 제출 중 상태로 중복 제출을 막는다
- **AND** 성공 뒤 본문, 공개 범위, 이미지, Alt Text, Sensitive Media와 오류 상태를 기본값으로 초기화한다
- **AND** 생성 Post 경로로 이동하거나 임시 Relay 목록 updater를 추가하지 않는다

#### Scenario: 내용 없는 제출 방지

- **WHEN** trim한 본문과 선택 이미지가 모두 없다
- **THEN** 앱은 게시 action을 비활성화한다
- **AND** 빈 본문 오류를 표시하거나 `createPost`를 호출하지 않는다

#### Scenario: 업로드 미완료 제출 방지

- **WHEN** 하나 이상의 이미지가 upload 중이거나 실패 상태다
- **THEN** 앱은 게시 action을 비활성화한다
- **AND** Ready가 아닌 Media ID를 `createPost`에 전달하지 않는다

#### Scenario: 작성 실패 표시

- **WHEN** `createPost`가 인증, active profile, validation, network 또는 GraphQL 오류로 실패한다
- **THEN** 앱은 안전한 한국어 오류를 표시한다
- **AND** 본문, 공개 범위, 이미지, Alt Text와 Sensitive Media를 수정하거나 다시 제출할 수 있게 유지한다
