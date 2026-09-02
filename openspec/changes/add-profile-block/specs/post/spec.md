## ADDED Requirements

### Requirement: Profile Block Post and Media visibility

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `PROD-822`. Post object·Post detail·Media relation과 Home·Local·Profile·Hashtag Post List 및 Post 검색은 Profile Block을 공통 visibility policy로 적용해야 한다(MUST). Block 관계의 상대 Profile이 Author인 Post와 상대 Profile의 Media는 양쪽 Profile의 직접 조회와 모든 해당 목록·검색 결과에서 Exclude해야 하며(MUST), Repost는 Repost Author와 Source Post Author 중 상대 Profile이 하나라도 있으면 Exclude해야 한다(MUST). 이 정책은 Post Visibility·Eligibility보다 접근 범위를 넓혀서는 안 된다(MUST NOT).

#### Scenario: Block된 Author의 Post와 Media를 직접 조회하지 않는다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대 Author의 Post detail 또는 Media relation을 조회한다
- **THEN** 시스템은 상대 Post와 Media를 조회 가능한 결과로 반환하지 않는다
- **AND** Post Visibility 또는 Media policy를 우회해 차단된 대상을 복원하지 않는다

#### Scenario: Home·Profile·Hashtag·Local 목록에서 Block 대상을 제외한다

- **WHEN** Block 관계의 한쪽 Profile이 Home, Profile, Hashtag 또는 Local Post List를 조회한다
- **THEN** 시스템은 상대 Profile이 작성한 Post를 후보에서 Exclude한다
- **AND** 현재 목록의 cursor/page limit 계산 전에 같은 Profile Block policy를 적용한다

#### Scenario: Repost Author와 Source Author 양쪽 Block을 적용한다

- **WHEN** Repost Author 또는 Repost Source Author가 Block 관계의 상대 Profile이다
- **THEN** 시스템은 해당 Repost를 목록·검색 후보에서 Exclude한다
- **AND** 기존 Repost Post와 Bookmark 관계 자체를 삭제하지 않는다

### Requirement: Profile Block Post interaction boundary

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, `PROD-822`. Post surface의 새 Reply·Reaction·Repost 입력은 공통 Profile Block predicate를 적용해 차단된 pair를 거부해야 하며(MUST). 차단으로 거부된 입력은 새 Post·Reaction·Repost 저장 결과를 남겨서는 안 되고(MUST NOT), 기존 Repost Post·Bookmark는 보존해야 한다(MUST).

#### Scenario: 차단된 상대를 향한 새 Post interaction을 거부한다

- **WHEN** Block 관계의 Owner 또는 Target이 상대 Profile의 Post에 Reply·Reaction·Repost를 새로 입력한다
- **THEN** 시스템은 공통 Profile Block policy에 따라 입력을 거부한다
- **AND** 차단 정책을 우회한 새 Post·Reaction·Repost row를 저장하지 않는다

#### Scenario: 차단과 무관한 기존 Post 상태를 보존한다

- **WHEN** Profile Block을 생성하거나 해제한다
- **THEN** 시스템은 기존 Repost Post와 Bookmark 관계를 삭제하지 않는다
- **AND** Block 해제 뒤 차단 생성 중 제거된 Reaction이나 기존 interaction을 자동으로 복구하지 않는다
