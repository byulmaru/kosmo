## Purpose

kosmo 게시글 capability의 현재 계약을 문서화한다. 게시글·게시글 콘텐츠 GraphQL object, versioned canonical document 저장과 파생 Plain Text 계약, 유니버설 앱의 React Native `TextInput` 작성 흐름을 다룬다.

## Requirements

### Requirement: Post GraphQL object

API는 활성 게시글을 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, 현재 콘텐츠, 공개 범위, 상태, 생성 시각을 제공해야 한다(MUST).

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** `content`는 게시글의 현재 콘텐츠를 가리킨다

#### Scenario: 공개 게시글 object 조회

- **WHEN** 클라이언트가 `PUBLIC` 또는 `UNLISTED` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: 작성자 본인의 비공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자이고 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: follower의 팔로워 공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자를 팔로우하고 `FOLLOWERS` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다

#### Scenario: 접근 권한 없는 viewer의 비공개 게시글 object 조회

- **WHEN** 인증되지 않았거나, 현재 active profile이 게시글 작성자가 아니고 게시글 작성자를 팔로우하지 않는 클라이언트가 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 게시글 Node를 조회한다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다
- **AND** `DIRECT` viewer 기준 세부 접근 제어는 후속 변경에서 정의한다

#### Scenario: 비활성 게시글 object 조회

- **WHEN** 게시글 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

### Requirement: 프로필 게시글 목록 connection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-388`, `PROD-429` API는 프로필이 작성한 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post를 최신순 Relay connection `Profile.posts`로 노출해야 하며(MUST), viewer와 작성자의 관계에 따라 공개 범위를 제한해야 한다(MUST). `Profile.posts`는 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST). Reply 여부와 Visibility·Eligibility는 page limit 전에 적용해야 한다(MUST).

#### Scenario: 공개 프로필 게시글 목록 조회

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC` 또는 `UNLISTED` 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post만 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: 작성자 본인의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 프로필이고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 모든 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post만 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: follower의 프로필 게시글 목록 조회

- **WHEN** 현재 active profile이 조회 대상 프로필을 팔로우하고 해당 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 해당 프로필이 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post만 반환한다
- **AND** `DIRECT` 공개 범위의 Post는 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 cursor 기반 페이지네이션을 지원한다

#### Scenario: Profile에서 Reply 제외

- **WHEN** Target Profile이 Reply Parent가 있는 Post를 작성했다
- **THEN** 시스템은 Reply이면서 Quote인 경우를 포함해 그 Post를 page limit 적용 전에 `Profile.posts` 후보에서 제외한다

#### Scenario: 게시글이 없는 프로필 목록 조회

- **WHEN** 조회 가능한 후보가 없는 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 빈 connection을 반환한다

#### Scenario: 프로필 목록에서 숨겨지는 게시글

- **WHEN** 인증되지 않았거나 현재 active profile이 조회 대상 프로필을 팔로우하지 않는 클라이언트가 프로필의 `posts` connection을 조회한다
- **THEN** 시스템은 `FOLLOWERS`, `DIRECT` 공개 범위의 Post를 반환하지 않는다

### Requirement: Home timeline connection

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-388`, `PROD-429` API는 현재 active profile 기준 eligible `ACTIVE` Post 후보를 최신순 Relay connection `Query.homeTimeline`로 노출해야 한다(MUST). `Query.homeTimeline`은 게시글 node 목록 공용 wrapper인 `PostConnection`을 반환해야 한다(MUST). 각 후보의 Visibility·Eligibility와 Reply 후보 정책은 page limit 전에 적용해야 한다(MUST). active profile이 없거나 인증되지 않은 조회에는 요청을 거부하지 않고 `null`을 반환해야 한다(MUST).

#### Scenario: 내 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 현재 active profile이 작성한 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post를 반환한다
- **AND** 게시글은 최신순으로 정렬된다
- **AND** connection은 첫 페이지 조회에 사용할 수 있어야 한다

#### Scenario: followee 게시글 포함

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 다른 활성 프로필을 팔로우한다
- **THEN** 시스템은 해당 followee가 작성한 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위의 eligible `ACTIVE` Post 중 Reply Parent가 없는 Post를 반환한다
- **AND** `DIRECT` 공개 범위의 Post는 반환하지 않는다
- **AND** 게시글은 최신순으로 정렬된다

#### Scenario: Home에서 viewer 관련 Reply 포함

- **WHEN** Reply가 viewer Profile의 Post에 달렸거나 viewer가 작성했거나, viewer가 팔로우한 Profile의 Post에 viewer가 팔로우한 Profile이 작성했다
- **THEN** 시스템은 Reply 자체가 Visibility와 Eligibility를 통과하면 Home 후보에 포함한다
- **AND** Reply이면서 Quote인 Post에도 같은 규칙을 적용한다

#### Scenario: Home에서 관련 없는 Reply 제외

- **WHEN** Reply가 Home의 viewer 관련 Reply 조건을 충족하지 않는다
- **THEN** 시스템은 그 Reply를 page limit 적용 전에 Home 후보에서 제외한다

#### Scenario: 비팔로우 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 현재 active profile이 작성자를 팔로우하지 않으며 그 Post가 viewer 관련 Reply 조건도 충족하지 않는다
- **THEN** 시스템은 해당 작성자의 Post를 반환하지 않는다

#### Scenario: 역방향 팔로워 게시글 제외

- **WHEN** active profile이 있는 인증자가 `homeTimeline` connection을 조회하고 다른 프로필이 현재 active profile을 팔로우하지만 현재 active profile은 그 프로필을 팔로우하지 않으며 그 Post가 viewer 관련 Reply 조건도 충족하지 않는다
- **THEN** 시스템은 해당 팔로워의 Post를 반환하지 않는다

#### Scenario: active profile 없는 홈 타임라인 조회

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `homeTimeline` connection을 조회한다
- **THEN** 시스템은 요청을 거부하지 않고 `homeTimeline` 필드로 `null`을 반환한다
- **AND** GraphQL 인증 오류를 발생시키지 않는다

### Requirement: PostContent GraphQL object

**Authority / Provenance:** `docs/domain/objects/post-content.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554, PROD-570. API는 현재 PostContent를 versioned document와 파생 호환 필드로 노출하고, 조회 가능한 PostContent에서 실제 Media Node 목록을 제공해야 한다(MUST).

#### Scenario: 게시글 콘텐츠 조회

- **WHEN** 클라이언트가 게시글의 현재 콘텐츠를 조회한다
- **THEN** 시스템은 `PostContent` object를 반환한다
- **AND** `PostContent`는 `id`, `document`, `bodyText`, `contentWarning`, `media`, `createdAt` 필드를 포함한다
- **AND** `document`는 서버가 검증하고 canonicalize한 `{ version, summary, body }` JSON이다
- **AND** GraphQL document의 Media node는 내부 DB UUID가 아니라 해당 Media global ID를 제공한다
- **AND** `bodyText`는 저장값이 아니라 `document.body`의 text, hard break와 paragraph 경계에서 결정적으로 파생되며 Media node를 텍스트로 추가하지 않는다
- **AND** `contentWarning`은 저장값이 아니라 `document.summary`를 노출하는 nullable 호환 필드다
- **AND** `PostContent`는 HTML 본문이나 raw Media storage reference를 노출하지 않는다

#### Scenario: PostContent Media Node 조회

- **WHEN** 조회 가능한 PostContent document가 하나 이상의 Media node를 참조한다
- **THEN** `PostContent.media`는 document 순서대로 실제 `Media` Node를 반환한다
- **AND** 각 Media는 global `id`, 저장된 `url`, `mediaType`, nullable `altText`를 제공한다
- **AND** Sensitive Media는 Media에 복제하지 않고 `PostContent.document` root에 유지한다

#### Scenario: Post 권한 scope grant

- **WHEN** viewer가 Post 조회 정책을 통과해 `PostContent.media`를 조회한다
- **THEN** field는 반환한 Media subtree에 Media 표시 조회 scope를 grant한다
- **AND** Media의 URL, media type, Alt Text는 이 grant를 요구한다
- **AND** standalone Media Node가 참조 Post를 역추적해 권한을 얻는 동작은 제공하지 않는다

#### Scenario: Media-owned Alt Text 갱신

- **WHEN** createPost가 `{mediaId, altText}` 첨부 입력을 받아 유효한 Media를 참조한다
- **THEN** PostContent document에는 Media ID와 순서만 저장한다
- **AND** 같은 transaction에서 Media의 nullable Alt Text를 입력값으로 갱신한다
- **AND** 같은 Media가 다른 값으로 다시 갱신되면 모든 참조 Post가 최신 값을 조회한다

#### Scenario: Media가 없거나 표시할 수 없는 경우

- **WHEN** document에 Media node가 없다
- **THEN** `PostContent.media`는 빈 목록을 반환한다
- **WHEN** 참조 Media row, Ready 상태, URL 또는 media type이 불완전하다
- **THEN** partial list 대신 `PostContent.media` 전체를 unavailable로 반환한다

#### Scenario: 저장된 representation만 사용하는 조회

- **WHEN** 시스템이 `PostContent.media`를 해석한다
- **THEN** Media row에 저장된 값만 사용하고 외부 storage service를 호출하지 않는다
- **AND** storage reference를 공개하지 않는다

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

### Requirement: Post composer usage boundary

유니버설 앱은 새 글 작성 컴포넌트 사용처에서 인증과 active profile 부재 상태를 처리해야 한다(MUST). `/compose` 사용처는 자기 route GraphQL operation에서 `currentSession.selectedProfile`과 새 글 작성 컴포넌트가 요구하는 `Profile` fragment를 선언해야 하며(MUST), 이미 열린 상태에서 프로필 전환이 성공하면 새 actor의 Relay environment에서 route query를 다시 실행해 작성 프로필을 반영해야 한다(MUST).

#### Scenario: 사용처 로딩 상태

- **WHEN** 새 글 작성 컴포넌트가 놓인 사용처가 현재 session과 active profile 정보를 불러오는 중이다
- **THEN** 시스템은 로딩 상태를 표시한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 인증되지 않은 사용자

- **WHEN** 인증 session이 없는 사용자가 새 글 작성 컴포넌트가 놓인 사용처에 접근한다
- **THEN** 시스템은 게시글을 작성하려면 로그인이 필요하다는 상태를 표시한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: 선택 프로필이 없는 사용자

- **WHEN** 로그인했지만 active profile이 선택되지 않은 사용자가 새 글 작성 컴포넌트가 놓인 사용처에 접근한다
- **THEN** 시스템은 홈(`/home`)으로 이동해 프로필을 만들거나 선택하도록 안내하고, 홈으로 이동하는 링크/버튼을 제공한다
- **AND** 시스템은 새 글 작성 컴포넌트를 렌더링하지 않는다
- **AND** 시스템은 `createPost` mutation을 호출하지 않는다

#### Scenario: `/compose` 첫 사용처

- **WHEN** 로그인한 사용자의 active profile이 선택된 상태에서 `/compose` route가 렌더링된다
- **THEN** `/compose` route query는 `currentSession.selectedProfile`에서 새 글 작성 컴포넌트가 선언한 `Profile` fragment를 spread한다
- **AND** `/compose` route는 자기 query 결과의 selected profile fragment ref를 작성 프로필로 사용한다
- **AND** 시스템은 selected profile이 있을 때만 새 글 작성 컴포넌트에 해당 fragment ref를 전달한다
- **AND** `/compose` route는 본문 입력, 공개 범위, 글자수, mutation 제출 로직을 직접 소유하지 않는다

#### Scenario: 이미 열린 `/compose`에서 active profile 전환

- **WHEN** 사용자가 `/compose` 화면을 열어 둔 상태에서 앱 셸의 프로필 전환을 성공시킨다
- **THEN** 시스템은 새 selected profile ID를 actor key로 사용해 Relay environment를 재생성한다
- **AND** `/compose` route query는 새 environment에서 `currentSession.selectedProfile`을 다시 조회해 새 글 작성 컴포넌트의 작성 프로필로 반영한다
- **AND** 새 글 작성 컴포넌트가 요구하는 `Profile` fragment 데이터는 프로필 전환 mutation이 아니라 `/compose` route query가 소유한다

### Requirement: Post visibility dropdown selection

**Authority / Provenance:** `docs/domain/objects/post.md` (Post Visibility와 Post 작성 입력 계약), [PROD-580](https://linear.app/byulmaru/issue/PROD-580/direct-%EA%B5%AC%ED%98%84-%EC%A0%84-composer%EC%9D%98-%EC%96%B8%EA%B8%89%ED%95%9C-%EA%B3%84%EC%A0%95%EB%A7%8C-%EC%98%B5%EC%85%98%EC%9D%84-%EC%9E%84%EC%8B%9C%EB%A1%9C-%EC%88%A8%EA%B8%B4%EB%8B%A4) (PROD-462 완료 전 Composer 임시 계약; 이 authority에 따라 이 requirement는 MUST로 적용한다.)

유니버설 앱은 새 글 작성 컴포넌트에서 게시글 공개 범위를 platform에 맞는 menu 또는 modal control로 선택할 수 있게 해야 한다(MUST). PROD-462가 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한을 완료하기 전까지 새 글 작성 컴포넌트는 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 선택·제출할 수 있게 해야 하며(MUST), `DIRECT`는 기존 enum과 서버 계약을 유지한 채 Composer 표면에서 숨겨야 한다(MUST).

#### Scenario: 공개 범위 옵션 표시

- **WHEN** PROD-462가 완료되기 전에 사용자가 작성 컴포넌트의 공개 설정 control을 연다
- **THEN** 시스템은 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 공개 범위 옵션만 표시한다
- **AND** 시스템은 `DIRECT` 공개 범위 옵션, “언급한 계정만” 라벨, 설명 또는 아이콘을 표시하지 않는다
- **AND** `PUBLIC` 옵션은 “공개”와 “모두가 볼 수 있어요.” 설명을 표시한다
- **AND** `UNLISTED` 옵션은 “조용한 공개”와 “모두가 볼 수 있지만 검색되지 않아요.” 설명을 표시한다
- **AND** `FOLLOWERS` 옵션은 “팔로워만”과 “팔로워만 볼 수 있어요.” 설명을 표시한다
- **AND** `PUBLIC` 옵션은 Lucide `GlobeIcon` 아이콘을 표시한다
- **AND** `UNLISTED` 옵션은 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** `FOLLOWERS` 옵션은 Lucide `LockIcon` 아이콘을 표시한다

#### Scenario: 기본 공개 범위

- **WHEN** 작성 컴포넌트가 처음 표시되고 프로필 기본 공개 범위 값이 제공되지 않는다
- **THEN** 시스템은 `UNLISTED`를 기본 공개 범위로 선택한다
- **AND** 공개 설정 control은 현재 선택된 `UNLISTED` 라벨을 표시한다
- **AND** 공개 설정 control은 현재 선택된 `UNLISTED`의 Lucide `MoonIcon` 아이콘을 표시한다
- **AND** 공개 설정 control과 외곽선 없는 본문 입력은 하나의 외곽선 editor surface 안에 표시된다
- **AND** 공개 설정 control은 본문 입력 영역 앞에 표시된다

#### Scenario: 공개 범위 변경

- **WHEN** 사용자가 공개 설정 surface에서 다른 공개 범위 옵션을 선택한다
- **THEN** 시스템은 작성 컴포넌트의 선택 공개 범위를 사용자가 선택한 값으로 갱신한다
- **AND** 시스템은 현재 선택된 공개 범위를 제출 전 컴포넌트에서 확인할 수 있게 표시한다
- **AND** 시스템은 공개 설정 surface를 닫는다

#### Scenario: DIRECT 신규 선택·제출 불가

- **WHEN** 사용자가 Composer의 공개 설정 surface 또는 키보드 탐색을 통해 새 공개 범위로 `DIRECT`를 선택하거나 제출하려 한다
- **THEN** 시스템은 `DIRECT` 선택지를 노출하지 않는다
- **AND** 시스템은 새 `createPost` mutation에 `visibility: DIRECT`를 전달하지 않는다
- **AND** 사용자는 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 선택해 기존 게시 동작을 계속 사용할 수 있다

#### Scenario: PROD-462 복원 기준

- **WHEN** PROD-462가 Mentioned Profile recipient 입력·저장과 DIRECT 조회 권한을 완료하고 그 계약의 검증 증거가 승인된다
- **THEN** Composer의 DIRECT 옵션 복원은 해당 완료를 근거로 한 별도 변경에서만 수행한다
- **AND** 그 완료 전에는 이 임시 세 옵션 계약을 유지한다

### Requirement: Character count indicator

유니버설 앱은 새 글 작성 컴포넌트에서 plain-text 본문의 글자수를 표시해야 한다(MUST).

#### Scenario: 글자수 표시

- **WHEN** 사용자가 본문 입력 영역에 plain text를 입력한다
- **THEN** 시스템은 trim한 plain text 기준 남은 글자수를 숫자만으로 표시한다
- **AND** 시스템은 현재 글자수와 최대 글자수를 `0 / 500` 같은 형식으로 함께 표시하지 않는다
- **AND** 시스템은 남은 글자수에 “자 남음” 같은 suffix를 붙이지 않는다
- **AND** 남은 글자수 숫자 인디케이터는 게시 버튼 바로 옆에 표시된다

#### Scenario: 글자수 제한 초과 표시

- **WHEN** trim한 plain-text 본문이 500자를 초과한다
- **THEN** 시스템은 글자수 인디케이터를 오류 상태로 표시한다
- **AND** 시스템은 남은 글자수를 음수 숫자로 표시한다
- **AND** 시스템은 제출 버튼을 비활성화한다

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

### Requirement: Versioned PostContent app rendering

유니버설 앱은 GraphQL `PostContent.document`의 versioned body를 제한된 native/web renderer로 표시하고 Plain Text composer 입력 계약을 유지해야 한다(MUST).

#### Scenario: document 우선 표시

- **WHEN** 앱이 게시글 콘텐츠를 표시한다
- **THEN** 앱은 `document.version`과 `document.body`를 renderer에 전달한다
- **AND** 지원되는 V1 document는 paragraph, text, hard break와 안전한 link 의미를 보존한다
- **AND** 미지원 또는 유효하지 않은 document이면 `bodyText`를 Plain Text fallback으로 표시한다

#### Scenario: Plain Text composer 유지

- **WHEN** 사용자가 로컬 게시글을 작성한다
- **THEN** 앱은 기존 React Native `TextInput` Plain Text UX를 유지한다
- **AND** 앱은 `CreatePostInput.bodyText`를 제출한다
- **AND** 앱 bundle에서 document를 만들기 위해 ProseMirror runtime을 사용하지 않는다

### Requirement: Post의 직접 Reply Parent 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-398` API는 기존 단일 GraphQL `Post` Node에 nullable `replyParent` field를 제공해야 하며(MUST), 현재 Post와 Parent의 Visibility와 Eligibility를 독립적으로 판정해야 한다(MUST).

#### Scenario: 직접 Parent 조회

- **WHEN** 조회 가능한 Post가 조회 가능한 직접 Reply Parent를 가진다
- **THEN** `Post.replyParent`는 저장된 직접 Parent를 기존 `Post` Node로 반환한다
- **AND** 다른 Post로 평탄화하지 않는다

#### Scenario: Reply Parent가 없는 Post

- **WHEN** 조회 가능한 Post가 Reply Parent를 가지지 않는다
- **THEN** `Post.replyParent`는 `null`을 반환한다

#### Scenario: 조회 불가능한 Parent

- **WHEN** 현재 Post는 조회 가능하지만 Parent가 Tombstone이거나 viewer 기준 Visibility 또는 Eligibility를 통과하지 못한다
- **THEN** 현재 Post 조회는 유지한다
- **AND** `Post.replyParent`만 `null`을 반환한다

### Requirement: Post의 Reply 조상 경로 GraphQL 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-399` API는 기존 단일 GraphQL `Post` Node에 pagination 없는 non-null `replyAncestors: [Post!]!` field를 제공해야 하며(MUST), 저장된 직접 Reply Parent부터 root 방향으로 조회 가능한 조상을 반환해야 한다(MUST).

#### Scenario: 직접 Parent 우선 조상 list

- **WHEN** 조회 가능한 Post가 여러 단계의 조회 가능한 Reply Parent를 가진다
- **THEN** `Post.replyAncestors`는 직접 Parent를 첫 요소로 반환한다
- **AND** 이후 요소는 저장된 Reply Parent 관계를 따라 root 방향으로 이어진다

#### Scenario: 조상이 없는 Post

- **WHEN** 조회 가능한 Post가 Reply Parent를 가지지 않거나 직접 Parent부터 조회할 수 없다
- **THEN** `Post.replyAncestors`는 빈 배열을 반환한다

#### Scenario: 조상 경로 pagination 제외

- **WHEN** 클라이언트가 Reply 조상 경로를 조회한다
- **THEN** API는 Relay connection이나 pagination 인자 없이 전체 조회 가능 경로를 non-null list로 반환한다

### Requirement: Post의 하위 Reply GraphQL 조회

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-388`, `PROD-400` API는 기존 단일 GraphQL `Post` Node에 non-null `replyDescendants: PostConnection!` field를 제공해야 한다(MUST). 이 connection은 `first`/`after`와 `last`/`before`를 지원하고(MUST), 조회 가능한 descendant를 `createdAt ASC, id ASC`로 정렬해야 한다(MUST).

#### Scenario: 직접·간접 하위 Reply 조회

- **WHEN** 현재 Post 아래에 조회 가능한 직접 Reply와 간접 Reply가 존재한다
- **THEN** `Post.replyDescendants`는 두 종류의 descendant를 모두 기존 `Post` Node로 반환한다

#### Scenario: 양방향 Relay pagination과 시간순 정렬

- **WHEN** 클라이언트가 여러 생성 시각과 같은 생성 시각을 가진 descendant를 앞이나 뒤 방향으로 조회한다
- **THEN** API는 `createdAt ASC, id ASC`의 동일한 전체 순서에서 `first`/`after`와 `last`/`before` page를 제공한다
- **AND** 같은 생성 시각에는 `id`를 deterministic tie-breaker로 사용한다
- **AND** 이 시간순 정렬만으로 Parent-before-child 위상 순서를 별도로 보장하지 않는다

#### Scenario: 조회 정책을 pagination 전에 적용

- **WHEN** descendant 구조에 조회 불가능한 Post와 조회 가능한 Post가 page 경계 앞뒤로 함께 존재한다
- **THEN** API는 각 descendant의 Visibility와 Eligibility를 page limit 전에 적용한다
- **AND** 조회 불가능한 후보 때문에 조회 가능한 page가 비거나 누락되지 않는다

### Requirement: Post Reaction 조회

**Authority / Provenance:** [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [ADR 0016](../../../docs/domain/decisions/0016-reaction-selector-current-state.md), [PROD-406](https://linear.app/byulmaru/issue/PROD-406), [PROD-407](https://linear.app/byulmaru/issue/PROD-407), [PROD-472](https://linear.app/byulmaru/issue/PROD-472), [PROD-576](https://linear.app/byulmaru/issue/PROD-576) API는 조회 가능한 Post에 현재 Reaction Type별 count, Type별 Reaction Profile connection과 selected Profile의 현재 Reaction 관계를 제공해야 한다(MUST). GraphQL API는 `Post.reactionCounts: [ReactionCount!]!`, `Post.reactionProfiles(type: String!): ProfileConnection!`과 `Post.viewerReactions: [Reaction!]!`를 제공해야 한다(MUST). `ReactionCount`는 `type: String!`과 `count: Int!`만 제공해야 한다(MUST).

#### Scenario: Post Reaction summary 조회

- **WHEN** viewer가 조회할 수 있는 Post의 Reaction summary를 요청한다
- **THEN** `Post.reactionCounts`는 현재 Reaction이 하나 이상 존재하는 Type과 count를 `ReactionCount` 목록으로 제공한다
- **AND** 목록은 각 Type에 현재 존재하는 Reaction의 최초 생성 시각 오름차순이다
- **AND** count는 Post를 조회할 수 있는 viewer 사이에서 같다
- **AND** 최초 생성 시각이 같은 Type에는 제품상 우선순위가 아닌 결정적 최종 순서를 적용한다
- **AND** 한 Type의 현재 Reaction이 모두 제거됐다가 다시 생성되면 새 현재 최초 생성 시각으로 순서를 정한다

#### Scenario: Reaction이 없는 Post summary 조회

- **WHEN** viewer가 현재 Reaction이 없는 조회 가능한 Post의 Reaction summary를 요청한다
- **THEN** `Post.reactionCounts`는 빈 목록을 반환한다

#### Scenario: Post Reaction Profile 조회

- **WHEN** viewer가 조회할 수 있는 Post에서 한 Reaction Type의 Profile connection을 요청한다
- **THEN** Post object는 해당 Type에 Reaction을 남겼고 viewer가 조회할 수 있는 Profile만 반환한다
- **AND** GraphQL field는 `reactionProfiles(type: String!): ProfileConnection!` 계약을 사용한다
- **AND** connection은 cursor pagination을 지원한다

#### Scenario: selected Profile의 Post Reaction 조회

- **WHEN** viewer가 조회 가능한 Post의 `viewerReactions`를 요청한다
- **THEN** Post object는 현재 selected Profile이 남긴 Reaction Node만 반환한다
- **AND** guest 또는 selected Profile이 없는 viewer에게 빈 목록을 반환한다
- **AND** 여러 Post를 함께 조회할 때 Post별 추가 query를 발생시키지 않는다

#### Scenario: Post 조회 정책 재사용

- **WHEN** viewer가 대상 Post를 GraphQL Post object로 조회할 수 없다
- **THEN** API는 그 Post의 Reaction summary, Profile connection과 selected Profile Reaction 목록도 노출하지 않는다

### Requirement: CreatePost caller-local connection synchronization

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641. Universal client는 `createPost` 성공 응답의 normalized `post`를 Relay의 선언형 connection directive로 요청 actor Environment의 이미 로드된 managed connection에만 반영해야 한다(MUST).

#### Scenario: Post 작성 성공

- **WHEN** `createPost`가 Original, Quote 또는 Reply Post를 반환한다
- **THEN** 앱은 로드된 Home connection의 첫 edge 앞에 canonical Post Node를 한 번 삽입한다

#### Scenario: Connection이 로드되지 않음

- **WHEN** 요청 actor Store에 대상 connection record가 없다
- **THEN** 앱은 connection이나 edge를 합성하지 않는다
- **AND** 광범위한 refetch 또는 client-side Post List 정책 계산을 시작하지 않는다

#### Scenario: Duplicate completion

- **WHEN** 같은 canonical Post Node에 대한 prepend handler가 같은 connection에 두 번 실행된다
- **THEN** 해당 Node를 참조하는 edge를 하나만 유지한다
- **AND** 기존 edge의 상대 순서를 변경하지 않는다

#### Scenario: Actor 전환 또는 Composer unmount

- **WHEN** 작성 요청 뒤 actor Environment가 전환되거나 Composer가 unmount된다
- **THEN** normalized payload와 connection handler는 요청을 시작한 Environment에만 적용된다
- **AND** 새 actor Store, unmounted state 또는 navigation을 늦게 변경하지 않는다

#### Scenario: Committed Post와 GraphQL 오류

- **WHEN** 응답이 `data.createPost.post`와 함께 nullable field의 GraphQL `errors[]`를 반환한다
- **THEN** 앱은 normalized Post를 로드된 대상 connection에 반영한다
- **AND** Composer는 committed Post를 성공으로 처리해 입력과 submitting 상태를 초기화한다

#### Scenario: Post가 없는 실패 결과

- **WHEN** mutation이 network 오류로 실패하거나 `data.createPost.post`를 제공하지 않는다
- **THEN** 기존 Home connection membership을 유지한다
- **AND** 낙관적 또는 client-only Post/edge를 남기지 않는다
