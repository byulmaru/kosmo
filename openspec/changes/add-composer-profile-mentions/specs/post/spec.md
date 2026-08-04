## ADDED Requirements

### Requirement: Plain Text Composer Profile mention 선택

유니버설 앱은 Profile mention 선택을 Plain Text와 제출 상태에 연결해야 한다(MUST).
PROD-652에 따라 현재 cursor의 `@` 검색어로 인증 `searchProfiles`를 사용하며, 직접 입력한 문자열로 Profile
identity를 추론해서는 안 된다(MUST NOT).

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/profile.md`,
`docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/design/accessibility.md`, `PROD-652`

#### Scenario: Profile 검색 시작과 결과 구분

- **WHEN** 사용자가 Composer의 현재 cursor 위치에서 `@`로 Profile 검색어를 입력한다
- **THEN** 앱은 현재 `@` token의 검색 가능한 handle 부분으로 기존 인증 `searchProfiles`를 요청한다
- **AND** 각 결과에 Avatar, 표시 이름과 `relativeHandle`을 표시한다
- **AND** 같은 handle의 local/remote 후보를 domain이 포함된 `relativeHandle`로 구분할 수 있게 한다

#### Scenario: Web keyboard와 pointer 선택

- **WHEN** Web에서 Profile 검색 결과 surface가 열려 있다
- **THEN** 사용자는 Arrow Up·Arrow Down·Home·End로 결과 focus를 이동하고 Enter 또는 pointer로 같은 Profile을 선택할 수 있다
- **AND** Escape는 선택 없이 결과 surface를 닫고 editor focus를 복원한다
- **AND** 결과 surface는 expanded·busy·option과 현재 focus 상태를 보조 기술에 전달한다

#### Scenario: Native keyboard와 touch 선택

- **WHEN** Android 또는 iOS에서 Profile 검색 결과가 표시된다
- **THEN** 사용자는 keyboard 또는 touch로 같은 Profile identity를 선택할 수 있다
- **AND** 결과 row와 loading·empty·error 상태는 platform screen reader가 식별할 수 있는 name·state를 제공한다
- **AND** Native 실제 keyboard·focus·screen reader 동작은 platform runtime에서 별도로 검증한다

#### Scenario: 선택한 mention 삽입

- **WHEN** 사용자가 검색 결과의 Profile을 선택한다
- **THEN** 앱은 현재 `@` 검색 token을 선택한 Profile의 `relativeHandle` Plain Text로 교체한다
- **AND** 삽입된 occurrence를 해당 Profile global ID와 연결한다
- **AND** 같은 Profile을 여러 occurrence에서 선택해도 제출 ID 목록에는 한 번만 포함한다
- **AND** 삽입된 Plain Text는 기존 500자 길이 계산에 포함한다

#### Scenario: 직접 입력 문자열

- **WHEN** 사용자가 검색 결과를 선택하지 않고 `@handle` 또는 선택 결과와 같은 문자열을 직접 입력한다
- **THEN** 앱은 해당 문자열을 기존 Plain Text로 유지한다
- **AND** 그 문자열만으로 Mentioned Profile ID를 제출 상태에 추가하지 않는다

#### Scenario: mention text 삭제와 수정

- **WHEN** 사용자가 선택으로 삽입된 mention occurrence를 삭제하거나 Profile identity를 보존하지 않는 text로 수정한다
- **THEN** 앱은 해당 occurrence와 Profile 연결을 제거한다
- **AND** 같은 Profile의 연결된 occurrence가 더 없으면 제출 ID 목록에서도 제거한다

#### Scenario: 검색 상태와 기존 작성 내용 보존

- **WHEN** Profile 검색이 loading, empty 또는 error 상태가 된다
- **THEN** 앱은 현재 본문, Media와 이미 선택한 mention occurrence를 유지한다
- **AND** 사용자가 본문을 계속 편집하거나 검색을 다시 시도할 수 있게 한다

#### Scenario: Composer context 전환

- **WHEN** selected Profile, Reply Parent 또는 Relay Environment가 바뀐다
- **THEN** 새 context의 첫 Composer commit부터 본문과 Mentioned Profile 선택 상태를 초기화한다
- **AND** 이전 context의 늦은 검색 또는 mutation completion이 새 context의 결과·본문·제출 ID를 변경하지 않는다

## MODIFIED Requirements

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-424`, `PROD-461`, `PROD-554`, `PROD-652`. 로그인했고 active profile이 있는 사용자는 Plain Text `bodyText`, 선택적인 Media item과 Sensitive Media, 선택적인 concrete `Post` `replyParentId`, 선택적인 Mentioned Profile global ID 목록으로 V1 canonical document 일반 Post 또는 Reply를 작성할 수 있어야 한다(MUST). selected Profile은 Local 또는 Remote일 수 있으며(MUST), GraphQL `usingProfile` entry point가 보장한 Active Account, membership과 selected Profile 조회 가능 상태를 resolver가 중복 검증하면 안 된다(MUST NOT).

#### Scenario: Plain Text와 Media 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, `visibility`, 최대 4개의 선택적 `{ mediaId, altText }` item, `sensitiveMedia`와 선택적 `mentionedProfileIds`로 `createPost`를 호출하고 `replyParentId`를 생략한다
- **THEN** 시스템은 현재 active profile이 작성한 `ACTIVE` Post와 첫 PostContent를 생성한다
- **AND** Post, 첫 PostContent와 각 Mentioned Profile 관계는 같은 transaction에서 생성되며 하나라도 실패하면 함께 rollback한다
- **AND** Post의 공개 범위는 입력받은 `visibility` 값이다
- **AND** `post.current_content_id`는 생성된 PostContent를 참조한다
- **AND** Media item은 입력 순서의 V1 Media node가 되고 Sensitive Media는 document root attr가 된다
- **AND** `post.reply_parent_id`와 `post.repost_source_id`는 `null`이다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 Post를 반환한다

#### Scenario: Plain Text Reply와 Mentioned Profile 작성 성공

- **WHEN** 로그인한 클라이언트가 유효한 본문 또는 Media item, `visibility`, 선택적 `sensitiveMedia`, 조회 가능한 contentful Parent의 concrete `Post` global ID와 선택적 `mentionedProfileIds`로 `createPost`를 호출한다
- **THEN** 시스템은 `current_content_id`와 입력 `reply_parent_id`를 가지고 `repost_source_id`는 `null`인 Active Post를 생성한다
- **AND** Reply의 공개 범위는 Parent와 독립적인 입력 `visibility` 값이다
- **AND** Media, Sensitive Media와 Mentioned Profile 관계는 일반 Post와 같은 검증·저장 계약을 따른다
- **AND** mutation은 일반 Post와 같은 `CreatePostPayload.post`로 생성된 단일 Post를 반환한다

#### Scenario: Remote selected Profile로 Post 또는 Reply 작성

- **WHEN** Active Account의 Member인 Active/Normal Remote Profile이 selected Profile인 상태에서 유효한 입력으로 `createPost`를 호출한다
- **THEN** 시스템은 selected Profile을 Author로 하는 일반 Post 또는 Reply를 생성한다
- **AND** Media의 Profile이 selected Profile과 달라도 Upload Account가 같으면 허용한다
- **AND** Mentioned Profile은 Author Profile의 Instance와 다른 local/remote Profile일 수 있다
- **AND** selected Profile, Media Profile 또는 Mentioned Profile의 Instance Type만으로 요청을 거부하지 않는다

#### Scenario: 본문과 Media 저장 형식

- **WHEN** 시스템이 Plain Text와 Media item으로 일반 Post 또는 Reply의 PostContent를 저장한다
- **THEN** 시스템은 bodyText를 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 paragraph content 다음에 입력 순서의 Media block node를 추가한다
- **AND** summary는 `null`이다
- **AND** persistence document의 Media node는 검증된 Media DB identity만 저장한다
- **AND** 같은 transaction에서 Media가 nullable Alt Text를 저장하고 document root가 Sensitive Media를 저장한다
- **AND** Plain Text, HTML 또는 Media ID 배열을 두 번째 canonical 값으로 저장하지 않는다

#### Scenario: Media-only Post 또는 Reply

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

#### Scenario: 유효한 Mentioned Profile 목록

- **WHEN** `mentionedProfileIds`가 서로 다른 concrete `Profile` global ID를 포함하고 각 Profile이 요청 시점의 기존 `searchProfiles` visibility를 통과한다
- **THEN** 시스템은 각 Profile을 Post의 Mentioned Profile 관계로 한 번씩 저장한다
- **AND** 입력 목록이 생략되거나 비어 있어도 기존 일반 Post 또는 Reply 작성을 허용한다
- **AND** ID 검증은 원격 lookup, refresh 또는 materialization을 시작하지 않는다

#### Scenario: 유효하지 않은 Mentioned Profile 목록

- **WHEN** `mentionedProfileIds`에 중복, 잘못된 concrete typename, 없는 Profile 또는 현재 `searchProfiles` visibility를 통과하지 않는 Profile이 포함된다
- **THEN** 시스템은 Mentioned Profile 존재·상태 차이를 노출하지 않는 validation 오류로 요청을 거부한다
- **AND** Post, PostContent, Media metadata와 Mentioned Profile 관계를 부분 저장하지 않는다

#### Scenario: 인증되지 않았거나 active profile 없는 작성 요청

- **WHEN** 유효한 session 또는 active profile 없이 `createPost`를 호출한다
- **THEN** 시스템은 GraphQL 인증 또는 active profile scope 오류로 요청을 거부한다
- **AND** Post와 PostContent를 생성하지 않는다

### Requirement: Plain Text post submission

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/objects/profile.md`, `PROD-461`, `PROD-553`, `PROD-554`, `PROD-652`. 유니버설 앱은 Composer의 Plain Text, Ready Media global ID와 nullable Alt Text 순서, Sensitive Media와 명시적으로 선택한 Mentioned Profile global ID를 `createPost` mutation에 제출해야 한다(MUST).

#### Scenario: 본문 또는 Media Post 작성 성공

- **WHEN** Composer가 유효한 본문 또는 Ready Media와 함께 제출된다
- **THEN** 앱은 bodyText, visibility, 순서 있는 `{ mediaId, altText }` item, Sensitive Media와 중복 없는 `mentionedProfileIds`를 `createPost` input으로 보낸다
- **AND** 제출 중 상태로 중복 제출을 막는다
- **AND** 성공 뒤 본문, 공개 범위, mention occurrence와 Profile ID, 이미지, Alt Text, Sensitive Media와 오류 상태를 기본값으로 초기화한다
- **AND** 생성 Post 경로로 이동하거나 임시 Relay 목록 updater를 추가하지 않는다

#### Scenario: 내용 없는 제출 방지

- **WHEN** trim한 본문과 선택 이미지가 모두 없다
- **THEN** 앱은 게시 action을 비활성화한다
- **AND** Mentioned Profile ID만으로 content 없는 Post를 제출하지 않는다
- **AND** 빈 본문 오류를 표시하거나 `createPost`를 호출하지 않는다

#### Scenario: 업로드 미완료 제출 방지

- **WHEN** 하나 이상의 이미지가 upload 중이거나 실패 상태다
- **THEN** 앱은 게시 action을 비활성화한다
- **AND** Ready가 아닌 Media ID를 `createPost`에 전달하지 않는다

#### Scenario: 작성 실패 표시

- **WHEN** `createPost`가 인증, active profile, validation, network 또는 GraphQL 오류로 실패한다
- **THEN** 앱은 안전한 한국어 오류를 표시한다
- **AND** 본문, 공개 범위, mention occurrence와 Profile ID, 이미지, Alt Text와 Sensitive Media를 수정하거나 다시 제출할 수 있게 유지한다
