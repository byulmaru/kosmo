## MODIFIED Requirements

### Requirement: Post GraphQL object

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-402`, `PROD-403`, `PROD-777`, `PROD-792` GraphQL Post authorization과 visibility는 중앙 application policy가 집행해야 하며(MUST), PostgreSQL RLS 또는 actor GUC에 의존해서는 안 된다(MUST NOT). API는 조회 가능한 활성 게시글을 기존 GraphQL `Post` Node로 노출해야 하며 작성자 프로필, nullable 현재 콘텐츠, nullable 직접 Repost Source, viewer-independent Repost count, 현재 selected Profile의 nullable Active Repost identity, 공개 범위, 상태와 생성 시각을 제공해야 한다(MUST).

원격 Quote의 `repostSource`는 Remote Quote Approval이 APPROVED이고 현재 viewer가 Source의 Post
Visibility와 Post Eligibility를 모두 통과할 때만 반환해야 한다(MUST). Source를 독립적으로 조회할 수 있거나
관계가 저장됐다는 사실만으로 승인 조건을 우회해서는 안 된다(MUST NOT). 승인 상태가 PENDING·INVALID·REVOKED이거나
Source가 없거나 조회 불가하면 `repostSource`는 null이며, 자체 조회 정책을 통과한 Quote의 Content와 Reply Parent
조회는 독립적으로 유지해야 한다(MUST). FEP 자기 인용·유효한 QuoteAuthorization과 승인서 면제 legacy의
승인 판정은 `docs/domain/objects/post.md`의 원격 인용 정보 반영을 따른다. 기존 Local Quote·일반 Post·Reply·Repost의
조회 계약은 유지해야 한다(MUST).

이 spec의 GraphQL enum `DIRECT`는 canonical 문서의 Mentioned Profiles visibility를 나타내는 API 표현이다.

#### Scenario: 활성 게시글 object 조회

- **WHEN** 클라이언트가 노출 가능한 활성 게시글 Node를 조회한다
- **THEN** 시스템은 `Post` object를 반환한다
- **AND** `Post`는 `id`, `profile`, `content`, `repostSource`, `repostCount`, `viewerRepost`, `visibility`, `state`, `createdAt` 필드를 포함한다
- **AND** `profile`은 게시글 작성자 프로필을 가리킨다
- **AND** `content`는 게시글의 nullable 현재 콘텐츠를 가리킨다
- **AND** `repostSource`는 저장된 nullable 직접 Source Post를 가리킨다

#### Scenario: 조회 가능한 Source를 가진 Repost와 Quote object 조회

- **WHEN** 클라이언트가 direct Source까지 조회 가능한 Repost 또는 Quote Node를 조회하고, 원격 Quote라면 Remote Quote Approval도 APPROVED다
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

#### Scenario: Source를 조회할 수 있어도 원격 Quote 미승인

- **WHEN** Quote 자체와 저장된 direct Source는 viewer가 조회할 수 있지만 원격 Quote 승인이 PENDING·INVALID·REVOKED 중 하나다
- **THEN** Quote의 `repostSource`는 null이다
- **AND** 자체 Content와 독립적인 Reply Parent 조회 정책을 유지한다

#### Scenario: 원격 Quote가 승인돼도 Source 조회 불가

- **WHEN** 원격 Quote는 APPROVED이지만 viewer가 direct Source의 Post Visibility 또는 Post Eligibility를 통과하지 못한다
- **THEN** Quote 자체가 조회 가능하면 Content를 반환하고 `repostSource`는 null이다
- **AND** 승인 자체로 viewer의 Source 조회 권한을 넓히지 않는다

#### Scenario: 자기 인용과 legacy 승인도 viewer 정책 적용

- **WHEN** 원격 Quote가 FEP 자기 인용 또는 승인서 면제 legacy 조건으로 APPROVED다
- **THEN** 현재 viewer가 direct Source 조회 정책을 통과한 경우에만 non-null `repostSource`를 반환한다
