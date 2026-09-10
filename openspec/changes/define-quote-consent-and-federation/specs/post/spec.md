## MODIFIED Requirements

### Requirement: Post GraphQL object

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/domain/objects/post.md`, `docs/domain/decisions/0027-quote-consent-and-federation.md`, `docs/domain/objects/profile-block.md`, PROD-902, PROD-431, PROD-924. 기존 계약 근거: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-402`, `PROD-403`, `PROD-777` GraphQL Post authorization과 visibility는 중앙 application policy가 집행해야 하며(MUST), PostgreSQL RLS 또는 actor GUC에 의존해서는 안 된다(MUST NOT). API는 조회 가능한 활성 게시글을 기존 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, nullable 현재 콘텐츠, nullable 직접 Repost Source, viewer-independent Repost count, 현재 selected Profile의 nullable Active Repost identity, 공개 범위, 상태와 생성 시각을 제공해야 한다(MUST).

이 spec의 GraphQL enum `DIRECT`는 canonical 문서의 Mentioned Profiles visibility를 나타내는 API 표현이다.

Quote Source는 인용 승인 조건과 viewer별 Source 조회 조건을 모두 통과할 때만 반환해야 한다(MUST).
승인되지 않았거나 거절·철회된 Source는 반환해서는 안 되며(MUST NOT), 자체 Content와 Post Node는
그 Post 자체의 조회 정책을 통과하면 유지해야 한다(MUST).

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `repostSource`, `repostCount`, `viewerRepost`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** `content`는 게시글의 nullable 현재 콘텐츠를 가리킨다
- **AND** `repostSource`는 저장된 nullable 직접 Source Post를 가리킨다

#### Scenario: 조회 가능한 Source를 가진 Repost와 Quote object 조회

- **WHEN** 클라이언트가 direct Source까지 조회 가능하고 Quote이면 인용 승인 조건도 통과한 Repost 또는 Quote Node를 조회한다
- **THEN** Repost는 `content = null`과 non-null `repostSource`를 제공한다
- **AND** Quote는 non-null `content`와 non-null `repostSource`를 제공한다
- **AND** Reply이면서 Quote인 Post도 같은 `Post` Node에서 Reply Parent와 Repost Source를 독립적으로 제공할 수 있다

#### Scenario: 공개 게시글 object 조회

- **WHEN** 클라이언트가 `PUBLIC` 또는 `UNLISTED` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 Post 자체가 Post Eligibility를 통과할 때 `Post` object를 반환한다

#### Scenario: 작성자 본인의 비공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자이고 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 Post 자체가 Post Eligibility를 통과할 때 `Post` object를 반환한다

#### Scenario: follower의 팔로워 공개 게시글 object 조회

- **WHEN** 현재 active profile이 게시글 작성자를 팔로우하고 `FOLLOWERS` 공개 범위의 활성 게시글 Node를 조회한다
- **THEN** 시스템은 Post 자체가 Post Eligibility를 통과할 때 `Post` object를 반환한다

#### Scenario: 접근 권한 없는 viewer의 비공개 게시글 object 조회

- **WHEN** 인증되지 않았거나, 현재 active profile이 게시글 작성자가 아니고 게시글 작성자를 팔로우하지 않는 클라이언트가 `FOLLOWERS` 또는 `DIRECT` 공개 범위의 게시글 Node를 조회한다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다
- **AND** `DIRECT` viewer 기준 세부 접근 제어는 후속 변경에서 정의한다

#### Scenario: 비활성 게시글 object 조회

- **WHEN** 게시글 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 해당 게시글을 GraphQL `Post` object로 노출하지 않는다

#### Scenario: application policy가 유일한 GraphQL 권한 집행 경계임

- **WHEN** GraphQL Post Node를 조회하고 application visibility/eligibility policy가 결과를 결정한다
- **THEN** 기존 Post authorization과 visibility 결과를 반환한다
- **AND** PostgreSQL RLS policy나 actor GUC가 없어도 같은 application policy 결과를 반환한다

#### Scenario: unavailable Repost Source를 가진 Content 없는 Repost 조회

- **WHEN** Content 없는 Repost의 direct Source가 Tombstone이거나 viewer 기준 Post Visibility 또는 Post Eligibility를 통과하지 못한다
- **THEN** 시스템은 해당 Repost를 GraphQL `Post` object로 노출하지 않는다

#### Scenario: unavailable Repost Source를 가진 Quote 조회

- **WHEN** Content 있는 Quote 또는 Reply이면서 Quote인 Post 자체는 조회 가능하지만 direct Source는 조회할 수 없다
- **THEN** 시스템은 Quote Post와 자체 Content를 GraphQL `Post` object로 반환한다
- **AND** nullable `repostSource`는 `null`을 반환한다
- **AND** direct Source의 Source가 unavailable하다는 이유로 바깥 Quote를 숨기지 않는다

#### Scenario: 원격 승인 대기 또는 철회된 Quote 조회

- **WHEN** Quote 자체는 조회 가능하지만 Source 승인이 대기·거절·철회 상태다
- **THEN** 같은 Post Node와 자체 Content를 반환하고 `repostSource`는 null이다
- **AND** Source가 저장되어 있거나 legacy 속성이 있다는 이유로 비노출을 우회하지 않는다

#### Scenario: Viewer가 Source Author를 차단한 단방향 관계

- **WHEN** 유효한 승인이 있고 Viewer가 Source Author를 차단했지만 Source Author는 Viewer를 차단하지 않았다
- **THEN** Quote에 별도 양방향 제한을 추가하지 않고 Viewer의 기존 방향별 Post 조회 정책으로 Source를 판정한다
- **AND** 기존 Post 조회 조건을 통과하면 Source를 반환한다

#### Scenario: Source Author가 Viewer를 차단한 역방향 관계

- **WHEN** 유효한 승인이 있지만 Source Author가 Viewer를 차단했다
- **THEN** 기존 방향별 Post 조회 정책에 따라 Source를 반환하지 않는다
- **AND** Quote 자체와 자체 Content는 그 Post의 조회 정책을 통과하면 유지한다

#### Scenario: 상호 차단과 제3자 조회

- **WHEN** Viewer와 Source Author가 서로 차단했거나 차단 당사자가 아닌 제3자가 승인된 Quote를 조회한다
- **THEN** 상호 차단 당사자에게는 Source를 반환하지 않는다
- **AND** 제3자는 승인이 철회되지 않았다면 자신의 기존 Source 조회 정책으로 판정한다

### Requirement: Plain Text post creation

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/decisions/0022-post-content-revision-media-nodes.md`, `PROD-424`, `PROD-461`, `PROD-554`, `PROD-431`, `PROD-902`, `docs/domain/decisions/0027-quote-consent-and-federation.md` 로그인했고 active profile이 있는 사용자는 Plain Text UX의 `bodyText`, 선택적 Media item과 Sensitive Media, 선택적 concrete `Post` `replyParentId`로 versioned canonical document의 일반 Post 또는 Reply를 작성할 수 있어야 한다(MUST). 기존 입력에 선택적 concrete `Post` global ID인 `repostSourceId`를 추가해 기본 Quote를 작성할 수 있어야 한다(MUST). `repostSourceId` 생략·null은 Source 없음이며, `replyParentId`와 `repostSourceId`를 함께 지정한 작성 요청은 거부해야 한다(MUST). selected Profile은 Local 또는 Remote일 수 있으며(MUST), GraphQL `usingProfile` entry point가 보장한 Active Account, membership과 selected Profile 조회 가능 상태를 resolver가 중복 검증하면 안 된다(MUST NOT).

#### Scenario: Plain Text 게시글 작성 성공

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText`, `visibility`, 최대 4개의 선택적 `{ mediaId, altText }` item과 `sensitiveMedia`로 `createPost` mutation을 호출하고 `replyParentId`와 `repostSourceId`를 생략한다
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

- **WHEN** 로그인한 클라이언트가 active profile이 선택된 상태에서 유효한 `bodyText` 또는 Media item, `visibility`, 선택적 `sensitiveMedia`와 조회 가능한 contentful Parent의 concrete `Post` global ID를 `replyParentId`로 제공하고 `repostSourceId`를 생략한다
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

#### Scenario: 기본 Quote 입력과 작성 결과

- **WHEN** 인증된 selected Profile이 유효한 본문 또는 Media와 인용 조건을 통과한 Source의 concrete Post global ID를 `repostSourceId`로 제출한다
- **THEN** 자체 Content와 인용 대상 정보를 원자적으로 기록하고 기존 `CreatePostPayload.post`를 반환한다
- **AND** Reply Parent는 없으며 Visibility는 Source와 독립적인 입력값이다
- **AND** Source는 유효한 승인과 viewer 접근 조건을 모두 통과할 때만 반환한다

#### Scenario: Source global ID와 접근 오류

- **WHEN** Source ID가 잘못된 형식·다른 Node type이거나 Source가 조회 불가·삭제·Content 없는 상태다
- **THEN** 요청을 거부하고 부분 작성 결과를 남기지 않는다
- **AND** 조회 권한이 없는 Source의 존재·Author·Content를 오류로 노출하지 않는다

#### Scenario: Source와 Parent 동시 입력

- **WHEN** 로컬 작성 요청에 non-null `repostSourceId`와 `replyParentId`가 함께 있다
- **THEN** 입력을 거부하고 Reply+Quote를 생성하지 않는다
- **AND** 기존 저장 관계와 원격 수신 결과를 변경하지 않는다
