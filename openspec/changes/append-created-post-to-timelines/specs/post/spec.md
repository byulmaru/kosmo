## MODIFIED Requirements

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, PROD-461, PROD-554, PROD-641. 로그인했고 active profile이 있는 사용자는 Plain Text `bodyText`, 선택적인 Media item과 Sensitive Media로 V1 canonical document Post를 작성할 수 있어야 한다(MUST). selected Profile은 Local 또는 Remote일 수 있으며(MUST), GraphQL `usingProfile` entry point가 보장한 Active Account, membership과 selected Profile 조회 가능 상태를 resolver가 중복 검증하면 안 된다(MUST NOT). 성공 payload는 같은 create transaction이 반환한 validated committed Post에서 Home·작성자 Profile edge를 같은 `PostConnection` edge shape로 투영해야 한다(MUST). Home edge는 성공한 모든 결과에 존재하고, Profile edge는 committed `replyParentId == null`일 때만 존재해야 한다(MUST). 이 relation-shape rule은 Original·Quote·Reply·Reply+Quote에 적용되며, 현재 GraphQL input fixture는 Original·Reply를 다룬다. 이 projection은 post-commit Post List policy DB read를 수행하지 않아야 한다(MUST NOT).

#### Scenario: Plain Text와 Media 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, `visibility`, 최대 4개의 선택적 `{ mediaId, altText }` item과 `sensitiveMedia`로 `createPost`를 호출한다
- **THEN** 시스템은 현재 active profile이 작성한 `ACTIVE` Post와 첫 PostContent를 생성한다
- **AND** Post와 첫 PostContent는 같은 transaction에서 생성되며 하나라도 실패하면 함께 rollback한다
- **AND** Post의 공개 범위는 입력받은 `visibility` 값이다
- **AND** `post.current_content_id`는 생성된 PostContent를 참조한다
- **AND** Media item은 입력 순서의 V1 Media node가 되고 Sensitive Media는 document root attr가 된다
- **AND** mutation은 `CreatePostPayload.post`로 생성된 Post를 반환한다
- **AND** payload는 생성 Post가 현재 selected Profile이 작성한 Content Post임을 검증한 committed invariant에서 `homeTimelineEdge`를 항상 반환한다
- **AND** `profilePostsEdge`는 committed `post.replyParentId == null`이면 반환하고, 그 밖에는 nullable `null`이다
- **AND** 각 edge는 `CreatePostPayload.post`와 동일한 canonical Post Node identity와 해당 Post List connection이 사용하는 cursor를 재사용한다
- **AND** mutation은 edge projection을 위해 post-commit Post List policy DB read를 수행하지 않는다

#### Scenario: Remote selected Profile로 게시글 작성

- **WHEN** Active Account의 Member인 Active/Normal Remote Profile이 selected Profile인 상태에서 유효한 입력으로 `createPost`를 호출한다
- **THEN** 시스템은 selected Profile을 Author로 하는 Post를 생성한다
- **AND** Media의 Profile이 selected Profile과 달라도 Upload Account가 같으면 허용한다
- **AND** selected Profile 또는 Media Profile의 Instance Type만으로 요청을 거부하지 않는다
- **AND** payload edge는 selected Profile이 작성한 committed Post invariant에서 투영되며 같은 Post/cursor identity를 사용한다

#### Scenario: 본문과 Media 저장 형식

- **WHEN** 시스템이 Plain Text와 Media item으로 PostContent를 저장한다
- **THEN** 시스템은 bodyText를 공통 V1 Plain Text 변환 경계에 전달한다
- **AND** trim과 line-ending normalization 뒤 paragraph content 다음에 입력 순서의 Media block node를 추가한다
- **AND** summary는 `null`이다
- **AND** persistence document의 Media node는 검증된 Media DB identity만 저장한다
- **AND** 같은 transaction에서 Media가 nullable Alt Text를 저장하고 document root가 Sensitive Media를 저장한다
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

### Requirement: Plain Text post submission

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-461, PROD-553, PROD-554, PROD-641. 유니버설 앱은 Composer의 Plain Text, Ready Media global ID와 nullable Alt Text 순서, Sensitive Media를 `createPost` mutation에 제출해야 한다(MUST). 성공 payload의 server-derived edge는 요청을 시작한 actor Store에서 이미 로드된 대상 Home·작성자 Profile managed connection에 최신순으로 한 번만 반영해야 한다(MUST).

#### Scenario: 본문 또는 Media Post 작성 성공

- **WHEN** Composer가 유효한 본문 또는 Ready Media와 함께 제출된다
- **THEN** 앱은 bodyText, visibility, 순서 있는 `{ mediaId, altText }` item과 Sensitive Media를 `createPost` input으로 보낸다
- **AND** 제출 중 상태로 중복 제출을 막는다
- **AND** 성공 뒤 본문, 공개 범위, 이미지, Alt Text, Sensitive Media와 오류 상태를 기본값으로 초기화한다
- **AND** 생성 Post 경로로 자동 이동하거나 광범위한 connection refetch를 시작하지 않는다
- **AND** payload가 제공한 edge만 요청 actor Store의 해당 managed connection에 반영한다

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
- **AND** Home·Profile connection membership을 변경하지 않는다

## ADDED Requirements

### Requirement: 작성된 Post의 현재 actor connection 즉시 반영

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, PROD-641. 유니버설 앱은 `Query.homeTimeline`과 `Profile.posts`를 pagination 인자와 무관한 안정적인 Relay managed connection으로 식별해야 한다(MUST). `createPost` 성공 payload가 서버가 committed Post invariant에서 투영한 edge만 요청을 시작한 actor Environment의 이미 로드된 대상 connection에 반영해야 하며(MUST), Post List 후보·Control Decision을 클라이언트에서 다시 계산하면 안 된다(MUST NOT). 삽입은 기존 최신순과 canonical Post identity를 보존하고 같은 Post Node의 edge를 중복시키면 안 된다(MUST NOT).

#### Scenario: Reply Parent 없는 Post를 Home과 작성자 Profile에 반영

- **WHEN** 성공한 `createPost` payload가 Reply Parent 없는 Post(Original 또는 Quote shape)를 반환하고 Home·Profile edge를 모두 반환한다
- **THEN** 앱은 요청 actor Store에 이미 로드된 Home과 작성자 Profile managed connection의 첫 edge 앞에 각각 생성 edge를 반영한다
- **AND** 두 connection은 동일한 canonical Post Node를 참조한다
- **AND** 기존 edge의 상대 순서와 connection cursor를 변경하지 않는다

#### Scenario: 작성한 Reply를 Home에만 반영

- **WHEN** 성공한 `createPost` payload가 Reply Parent가 있는 Post를 반환하고 서버가 `homeTimelineEdge`만 반환한다
- **THEN** 앱은 요청 actor Store의 이미 로드된 Home managed connection에만 생성 edge를 반영한다
- **AND** 작성자 Profile connection과 그 밖의 connection은 변경하지 않는다
- **AND** Reply이면서 Quote인 Post에도 서버가 반환한 동일 surface 판정을 적용한다

#### Scenario: nullable Profile edge를 보완하지 않음

- **WHEN** `createPost`가 Reply Parent가 있는 committed Post를 반환해 `profilePostsEdge`가 `null`이다
- **THEN** 앱은 해당 surface connection에 edge를 생성하거나 삽입하지 않는다
- **AND** edge 부재를 보완하기 위해 Post List 정책을 재계산하거나 connection refetch를 시작하지 않는다

#### Scenario: 로드되지 않은 connection을 합성하지 않음

- **WHEN** 요청 actor Store에 payload edge의 대상 managed connection이 로드되어 있지 않다
- **THEN** 앱은 connection record나 목록 결과를 합성하지 않는다
- **AND** 이후 정상 Home·Profile query가 서버 Post List Policy와 정렬에 따른 결과를 제공한다

#### Scenario: 중복 completion에서 단일 edge 유지

- **WHEN** 재시도 또는 중복 completion이 같은 canonical Post Node의 edge를 같은 managed connection에 다시 적용한다
- **THEN** 앱은 connection에서 해당 Post Node를 참조하는 edge를 정확히 하나만 유지한다
- **AND** 기존 edge가 있으면 별도 client-only Post Node나 두 번째 edge를 만들지 않는다

#### Scenario: actor Environment 전환 중 늦은 성공

- **WHEN** 작성 요청 뒤 selected Profile 전환으로 새 Relay Environment와 Store가 생성된 다음 이전 요청이 성공한다
- **THEN** payload normalization과 edge 반영은 요청을 시작한 이전 actor Environment로만 제한된다
- **AND** 새 actor Store의 Home·Profile connection과 Composer 상태를 변경하지 않는다

#### Scenario: route 전환 또는 unmount 뒤 성공

- **WHEN** 작성 요청 뒤 route가 전환되거나 Composer가 unmount된 다음 같은 actor Environment에서 요청이 성공한다
- **THEN** payload edge는 요청 actor Store의 이미 로드된 대상 connection에만 반영될 수 있다
- **AND** unmount된 Composer state, navigation 또는 새 route UI에 늦은 callback 결과를 적용하지 않는다

#### Scenario: 실패 결과에서 기존 목록 유지

- **WHEN** `createPost`가 network, GraphQL 또는 validation 오류로 실패하거나 payload edge를 제공하지 않는다
- **THEN** 앱은 기존 Home·Profile connection edge 순서와 membership을 유지한다
- **AND** 낙관적 또는 client-only edge를 남기지 않는다
