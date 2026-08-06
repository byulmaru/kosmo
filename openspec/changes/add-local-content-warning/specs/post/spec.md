## MODIFIED Requirements

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-460`, `PROD-424`, `PROD-461`, `PROD-554` 로그인했고 active profile이 있는 사용자는 Plain Text UX의 `bodyText`, optional nullable `contentWarning`, 선택적 Media item과 Sensitive Media, 선택적 concrete `Post` `replyParentId`로 versioned canonical document의 일반 Post 또는 Reply를 작성할 수 있어야 한다(MUST). selected Profile은 Local 또는 Remote일 수 있으며(MUST), GraphQL `usingProfile` entry point가 보장한 Active Account, membership과 selected Profile 조회 가능 상태를 resolver가 중복 검증하면 안 된다(MUST NOT).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, optional nullable `contentWarning`, `visibility`, 최대 4개의 선택적 `{ mediaId, altText }` item과 `sensitiveMedia`로 `createPost` mutation을 호출하고 `replyParentId`를 생략한다
- **THEN** 시스템은 새 `post` 행을 생성한다
- **AND** 게시글 작성자는 현재 세션의 active profile이다
- **AND** 게시글 상태는 `ACTIVE`이다
- **AND** 게시글 공개 범위는 입력받은 `visibility` 값이다
- **AND** 시스템은 새 `post_content` 행을 생성한다
- **AND** `post.current_content_id`는 생성된 콘텐츠를 참조한다
- **AND** Post와 첫 PostContent는 같은 transaction에서 생성되며 하나라도 실패하면 함께 rollback한다
- **AND** non-null Content Warning은 첫 PostContent document의 `summary`에 저장된다
- **AND** Media item은 입력 순서의 V1 Media node가 되고 Sensitive Media는 document root attr가 된다
- **AND** `post.reply_parent_id`와 `post.repost_source_id`는 `null`이다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 `Post`를 반환한다

#### Scenario: Remote selected Profile로 게시글 작성

- **WHEN** Active Account의 Member인 Active/Normal Remote Profile이 selected Profile인 상태에서 유효한 입력으로 `createPost`를 호출한다
- **THEN** 시스템은 selected Profile을 Author로 하는 Post를 생성한다
- **AND** Media의 Profile이 selected Profile과 달라도 Upload Account가 같으면 허용한다
- **AND** selected Profile 또는 Media Profile의 Instance Type만으로 요청을 거부하지 않는다

#### Scenario: Plain Text Reply 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText` 또는 Media item, optional nullable `contentWarning`, `visibility`, 선택적 `sensitiveMedia`와 조회 가능한 contentful Parent의 concrete `Post` global ID를 `replyParentId`로 제공한다
- **THEN** 시스템은 `current_content_id`와 입력 `reply_parent_id`를 가지고 `repost_source_id`는 `null`인 Active Post를 생성한다
- **AND** Reply의 공개 범위는 Parent와 독립적인 입력 `visibility` 값이다
- **AND** 입력 Content Warning, Media item과 Sensitive Media는 일반 Post와 같은 PostContent document 계약을 따른다
- **AND** mutation은 일반 Post와 같은 `CreatePostPayload.post`로 생성된 단일 `Post`를 반환한다

#### Scenario: 본문, Content Warning과 Media 저장 형식

- **WHEN** 시스템이 Plain Text, optional nullable Content Warning과 선택적 Media item으로 게시글 또는 Reply 콘텐츠를 저장한다
- **THEN** 시스템은 입력 문자열을 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 paragraph content 다음에 입력 순서의 Media block node를 추가한다
- **AND** non-null `contentWarning`은 같은 normalization을 거쳐 V1 canonical PostContent document의 `summary`에 저장하고, 입력이 생략되거나 `null`이면 `summary`는 `null`이다
- **AND** trim된 Plain Text가 canonical document에서 다시 동일하게 projection된다
- **AND** persistence document의 Media node는 검증된 Media DB identity만 저장한다
- **AND** 같은 transaction에서 Media가 nullable Alt Text를 저장하고 document root가 Sensitive Media를 저장한다
- **AND** Content Warning을 위한 별도 Post 필드·저장 모델·DB 컬럼을 만들지 않는다
- **AND** 시스템은 Plain Text, HTML 또는 Media ID 배열을 별도 canonical 값으로 저장하지 않는다

#### Scenario: Media-only Post 또는 Reply

- **WHEN** trim한 bodyText가 비어 있지만 하나 이상의 유효한 Media item이 입력된다
- **THEN** 시스템은 빈 paragraph와 Media node를 가진 PostContent를 생성한다
- **AND** bodyText projection은 빈 문자열이다

#### Scenario: 유효하지 않은 본문과 Media 조합

- **WHEN** 클라이언트가 trim한 bodyText와 Media item이 모두 없거나 Content Warning과 body에서 파생한 authored Plain Text 합계가 500자를 초과하는 입력으로 `createPost` mutation을 호출한다
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

### Requirement: Plain Text post composer component

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-642`, PROD-461, PROD-553. 유니버설 앱은 Profile fragment ref를 받는 React Native Post Composer에서 Plain Text 본문, nullable Content Warning과 최대 4개 이미지의 업로드·작성 상태를 함께 관리해야 한다(MUST). 본문과 Content Warning 작성에는 TipTap, ProseMirror runtime 또는 WebView editor를 포함하면 안 된다(MUST NOT).

#### Scenario: 작성 컴포넌트 fragment 계약

- **WHEN** 부모 query가 Post 작성에 사용할 active profile을 조회한다
- **THEN** Composer는 자기 Profile fragment와 `ProfileNameBlock_profile` fragment를 spread한다
- **AND** 개별 profile scalar가 아닌 fragment ref prop을 받는다

#### Scenario: 작성 폼 표시

- **WHEN** Composer가 유효한 active profile과 함께 렌더링된다
- **THEN** 앱은 Plain Text 본문과 optional Content Warning 입력, 이미지 추가 action, 공개 범위, 남은 글자수와 게시 action을 표시한다
- **AND** 선택 이미지의 preview, upload 상태, 제거 action과 nullable Alt Text 입력을 표시한다
- **AND** 이미지가 있으면 Sensitive Media control을 표시한다
- **AND** interactive control은 플랫폼 target, accessible name, disabled·busy·error state를 제공한다

#### Scenario: 제출 가능 상태

- **WHEN** 본문 또는 하나 이상의 Ready Media가 있고 다른 선택 이미지가 upload 중·실패 상태가 아니며 Content Warning과 본문의 합산 길이가 유효하다
- **THEN** 게시 action을 활성화한다
- **AND** 그 밖의 상태에서는 게시 action을 비활성화한다

### Requirement: Character count indicator

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/design/reply-composer.md`, `docs/design/accessibility.md`, `PROD-642` 유니버설 앱은 새 글 작성 컴포넌트에서 nullable Content Warning과 plain-text 본문의 합산 글자수를 표시해야 한다(MUST).

#### Scenario: 글자수 표시

- **WHEN** 사용자가 Content Warning 또는 본문 입력 영역에 plain text를 입력한다
- **THEN** 시스템은 trim·normalize한 Content Warning과 본문 plain text의 합계 기준 남은 글자수를 숫자만으로 표시한다
- **AND** 시스템은 현재 글자수와 최대 글자수를 `0 / 500` 같은 형식으로 함께 표시하지 않는다
- **AND** 시스템은 남은 글자수에 “자 남음” 같은 suffix를 붙이지 않는다
- **AND** 남은 글자수 숫자 인디케이터는 게시 버튼 바로 옆에 표시된다

#### Scenario: 글자수 제한 초과 표시

- **WHEN** trim·normalize한 Content Warning과 plain-text 본문의 합계가 500자를 초과한다
- **THEN** 시스템은 글자수 인디케이터를 오류 상태로 표시한다
- **AND** 시스템은 남은 글자수를 음수 숫자로 표시한다
- **AND** 시스템은 제출 버튼을 비활성화한다

### Requirement: Plain Text post submission

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `PROD-460`, `PROD-642`, PROD-461, PROD-553, PROD-554. 유니버설 앱은 Composer의 Plain Text, optional nullable Content Warning, Ready Media global ID와 nullable Alt Text 순서, Sensitive Media를 `createPost` mutation에 제출해야 한다(MUST).

#### Scenario: 본문 또는 Media Post 작성 성공

- **WHEN** Composer가 유효한 본문 또는 Ready Media와 함께 제출된다
- **THEN** 앱은 bodyText, optional nullable contentWarning, visibility, 순서 있는 `{ mediaId, altText }` item과 Sensitive Media를 `createPost` input으로 보낸다
- **AND** 제출 중 상태로 중복 제출을 막는다
- **AND** 성공 뒤 본문, Content Warning, 공개 범위, 이미지, Alt Text, Sensitive Media와 오류 상태를 기본값으로 초기화한다
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
- **AND** 본문, Content Warning, 공개 범위, 이미지, Alt Text와 Sensitive Media를 수정하거나 다시 제출할 수 있게 유지한다

### Requirement: Versioned PostContent app rendering

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/design/reply-composer.md`, `PROD-460`, `PROD-642` 유니버설 앱은 GraphQL `PostContent.document`의 versioned body를 제한된 native/web renderer로 표시하고 Plain Text composer 입력 계약을 유지해야 한다(MUST).

#### Scenario: document 우선 표시

- **WHEN** 앱이 게시글 콘텐츠를 표시한다
- **THEN** 앱은 `document.version`과 `document.body`를 renderer에 전달한다
- **AND** 지원되는 V1 document는 paragraph, text, hard break와 안전한 link 의미를 보존한다
- **AND** 미지원 또는 유효하지 않은 document이면 `bodyText`를 Plain Text fallback으로 표시한다

#### Scenario: Plain Text composer 유지

- **WHEN** 사용자가 로컬 게시글을 작성한다
- **THEN** 앱은 기존 React Native `TextInput` Plain Text UX를 유지한다
- **AND** 앱은 `CreatePostInput.bodyText`를 제출한다
- **AND** Content Warning이 있으면 optional nullable `CreatePostInput.contentWarning`으로 제출한다
- **AND** 앱 bundle에서 document를 만들기 위해 ProseMirror runtime을 사용하지 않는다

## ADDED Requirements

### Requirement: Post identity 기반 Content Warning reveal 상태

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/design/reply-composer.md`, `PROD-642` 유니버설 앱은 Content Warning이 있는 Post의 reveal 상태를 하나의 selected Profile·session lifecycle 안에서 canonical `Post.id` 기준으로 관리하고 Home·Profile·Thread를 포함해 같은 Post가 표시되는 모든 surface에서 공유해야 한다(MUST). selected Profile 또는 session 전환 시 Provider는 새 reveal store를 생성해 이전 lifecycle의 모든 reveal 상태를 초기화해야 한다(MUST). Reveal 상태를 PostContent document, 별도 서버 모델 또는 DB 컬럼에 저장하면 안 된다(MUST NOT).

#### Scenario: Content Warning이 있는 Post의 초기 표시

- **WHEN** 공용 reveal 상태에서 아직 reveal되지 않은 Content Warning Post를 표시한다
- **THEN** 앱은 Content Warning을 표시하고 본문과 Media를 가린다
- **AND** Content Warning이 없는 Post에는 reveal 상태를 적용하지 않는다

#### Scenario: 같은 Post의 surface 간 reveal 공유

- **WHEN** 사용자가 Home, Profile, Thread 또는 다른 Post surface에서 Content Warning이 있는 Post를 reveal하거나 다시 가린다
- **THEN** 현재 mounted되어 있거나 이후 표시되는 모든 surface의 같은 `Post.id`가 동일한 reveal 상태를 사용한다
- **AND** component instance, route, surface, selected Profile 또는 PostContent revision별 별도 reveal state를 만들지 않는다
- **AND** component unmount·remount나 surface 이동만으로 같은 Post의 상태를 초기화하지 않는다
- **AND** 이 공유는 현재 selected Profile·session lifecycle 안에서만 적용하며, 그 lifecycle의 공용 key는 canonical `Post.id`다

#### Scenario: selected Profile 또는 session 전환

- **WHEN** selected Profile이 바뀌거나 session이 로그아웃·교체되어 새 lifecycle이 시작된다
- **THEN** Provider는 새 reveal store를 생성하고 이전 lifecycle의 모든 Post reveal 상태를 초기화한다
- **AND** 이전 lifecycle에서 reveal된 Post가 새 Profile·session의 같은 `Post.id`로 표시되어도 가림 상태로 시작한다
- **AND** 이 reset은 같은 lifecycle 안의 surface 이동·component remount reset과 구분된다

#### Scenario: 서로 다른 Post와 Sensitive Media의 독립 상태

- **WHEN** 서로 다른 `Post.id`의 Content Warning Post를 표시한다
- **THEN** 각 Post의 reveal 상태는 서로 독립적이다
- **AND** Content Warning reveal은 Sensitive Media 공개 상태를 변경하지 않는다
