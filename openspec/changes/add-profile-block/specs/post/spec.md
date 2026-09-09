## Delivery and verification scope

`PROD-822`·`PROD-813`의 2026-09-06 범위 결정에 따라 아래 정책은 모든 Post List·검색에 적용하되, 현재 consumer는 실제 공개 결과로 검증하고
아직 없는 Hashtag Post List·Post 검색은 공통 후보 정책 검증까지만 이번 change의 완료 기준으로 삼는다. 두 endpoint의 신규 구현·실제 E2E는
archive 조건이 아니며, 공통 정책 검증 결과와 실제 endpoint 검증을 실행하지 않았다는 사실을 구분해 기록한다. 검증 시점에 해당 consumer가 이미 제공되면
실제 API 회귀를 적용한다. archive 이후 추가되는 endpoint의 연결·검증은 해당 기능 이슈가 소유한다.

## ADDED Requirements

### Requirement: Profile Block applies directional Post and Media access

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/objects/bookmark.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `PROD-822`. Post object·Post detail·Media relation과 Profile Post List는 Block 방향에 따른 콘텐츠 정책을 적용해야 한다(MUST). Owner → Target Block에서 Owner는 Target의 Post·PostContent·첨부 Media를 기존 Post Visibility·Eligibility와 Media 정책에 따라 조회할 수 있고(MUST), Target은 Owner의 해당 콘텐츠를 조회할 수 없어야 한다(MUST NOT). 서로 Block한 경우에는 양쪽 직접 조회를 모두 제한해야 한다(MUST). Home·Local·Hashtag Post List·Post 검색·Bookmark·Reaction Profile 목록은 상대 Profile의 콘텐츠를 양방향으로 Exclude해야 하며(MUST), Repost는 Repost Author와 Source Post Author에 해당 surface의 방향별 또는 양방향 정책을 각각 적용해야 한다(MUST). 어느 경우에도 기존 Post Visibility·Eligibility보다 접근 범위를 넓혀서는 안 된다(MUST NOT).

#### Scenario: Owner와 Target의 직접 Post·Media·Profile Post List 조회 방향을 구분한다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대 Author의 Post detail, PostContent, 첨부 Media 또는 Profile Post List를 조회한다
- **THEN** Owner의 Target 콘텐츠와 Profile Post List 조회에는 기존 Post Visibility·Eligibility와 Media 정책을 적용한다
- **AND** Target의 Owner 콘텐츠와 Profile Post List 조회에는 해당 Post·PostContent·첨부 Media를 반환하지 않는다
- **AND** Target → Owner Block도 함께 존재하면 양쪽 직접 조회를 모두 제한한다

#### Scenario: Home·Hashtag·Local 목록에서 Block 대상을 제외한다

- **WHEN** Block 관계의 한쪽 Profile이 Home, Hashtag 또는 Local Post List를 조회한다
- **THEN** 시스템은 상대 Profile이 작성한 Post를 후보에서 Exclude한다
- **AND** 현재 목록의 cursor/page limit 계산 전에 같은 Profile Block policy를 적용한다

#### Scenario: Repost Author와 Source Author 양쪽 Block을 적용한다

- **WHEN** Repost Author 또는 Repost Source Author가 Block 관계의 상대 Profile이다
- **THEN** 시스템은 해당 Repost를 목록·검색 후보에서 Exclude한다
- **AND** 기존 Repost Post와 Bookmark 관계 자체를 삭제하지 않는다

### Requirement: Profile Block protects Post interactions in both directions

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, `PROD-822`. Post surface의 새 Reply·Quote·Reaction·Repost 입력은 Profile Block의 양쪽 viewer 방향에 따라 거부해야 한다(MUST). Profile Block으로 거부된 입력의 기존 보존 대상 Post·Reaction·Repost·Bookmark 상태는 유지해야 한다(MUST).

#### Scenario: PostContent와 Media 표시 필드가 방향별 Post 정책을 우회하지 않는다

- **WHEN** Block 관계의 상대 Author가 작성한 PostContent Node, PostContent의 Media 또는 Profile avatar/header를 조회한다
- **THEN** PostContent와 첨부 Media에는 직접 Post의 방향별 정책을 적용하고 Profile avatar/header에는 기존 Profile 조회 정책을 적용한다
- **AND** 해당 surface의 기존 Post·Profile·Media 조회 조건을 통과하지 못한 표시 필드와 Media 정보를 반환하지 않는다
- **AND** 이미 알고 있는 ID나 다른 field의 scope grant만으로 차단된 내용을 복구하지 않는다
- **AND** standalone Media Node의 기존 Upload Account 권한을 공개 Post 역추적 권한으로 넓히지 않는다

#### Scenario: 차단된 후보가 page를 채우거나 다음 page의 정상 후보를 가리지 않는다

- **WHEN** 목록·검색을 정렬했을 때 앞부분에 Block된 Author 또는 Source Author의 Post가 있고 뒤에 조회 가능한 Post가 있다
- **THEN** 공통 후보 정책은 차단된 Post를 제외한 뒤 cursor와 page limit을 계산한다
- **AND** 조회 가능한 후속 후보와 pageInfo를 차단된 row에 대한 사후 필터링으로 누락하지 않는다
- **AND** 기존 Local PUBLIC eligibility와 다른 Post Visibility 제한은 계속 적용한다

#### Scenario: 보존된 Bookmark의 Post가 차단되어 있으면 표시하지 않는다

- **WHEN** Owner의 기존 Bookmark가 Block 관계의 상대 Author 또는 Source Author를 가리킨다
- **THEN** Bookmark 표면은 현재 Post 조회 정책을 적용해 보호된 Post와 내용을 표시하지 않는다
- **AND** Block 정책을 적용하기 위해 Bookmark 관계 자체를 삭제하지 않는다

### Requirement: Profile Block Post interaction boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, `PROD-822`. Post surface의 새 Reply·Reaction·Repost 입력은 공통 Profile Block predicate를 적용해 차단된 pair를 거부해야 한다(MUST). 차단으로 거부된 입력은 새 Post·Reaction·Repost 저장 결과를 남겨서는 안 되고(MUST NOT), 기존 Repost Post·Bookmark는 보존해야 한다(MUST).

#### Scenario: 차단된 상대를 향한 새 Post interaction을 거부한다

- **WHEN** Block 관계의 Owner 또는 Target이 상대 Profile의 Post에 Reply·Quote·Reaction·Repost를 새로 입력한다
- **THEN** 시스템은 Profile Block interaction 정책에 따라 입력을 거부한다
- **AND** 해당 입력의 결과로 새 Post·Reaction·Repost row를 저장하지 않는다

#### Scenario: 차단과 무관한 기존 Post 상태를 보존한다

- **WHEN** Profile Block을 생성하거나 해제한다
- **THEN** 시스템은 기존 Repost Post와 Bookmark 관계를 보존한다

#### Scenario: 조회 가능한 Post의 Reaction 수와 Profile 목록을 구분한다

- **WHEN** viewer가 조회할 수 있는 제삼자의 Post에 Block된 상대가 남긴 기존 Reaction이 있다
- **THEN** 시스템은 기존 Reaction을 삭제하지 않고 Post의 Reaction Type별 개수도 viewer와 무관하게 유지한다
- **AND** Reaction을 남긴 Profile 목록에서는 viewer가 조회할 수 없는 상대 Profile을 제외한다
