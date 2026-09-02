## ADDED Requirements

### Requirement: Profile Block Post and Media visibility

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `PROD-822`, `PROD-813`. Post object·Post detail·Media relation과 Home·Local·Profile·Hashtag Post List 및 Post 검색은 Profile Block을 공통 visibility policy로 적용해야 한다(MUST). Block 관계의 상대 Profile이 Author인 Post와 상대 Profile의 Media는 양쪽 Profile의 직접 조회와 모든 해당 목록·검색 결과에서 Exclude해야 하며(MUST), Repost는 Repost Author와 Source Post Author 중 상대 Profile이 하나라도 있으면 Exclude해야 한다(MUST). 이 정책은 Post Visibility·Eligibility보다 접근 범위를 넓혀서는 안 된다(MUST NOT).

#### Scenario: Block된 Author의 Post와 Media를 직접 조회하지 않는다

- **WHEN** Owner → Target Profile Block이 존재하고 Owner 또는 Target이 상대 Author의 Post detail 또는 Media relation을 조회한다
- **THEN** 시스템은 상대 Post와 Media를 조회 가능한 결과로 반환하지 않는다
- **AND** Post Visibility 또는 Media policy를 우회해 차단된 대상을 복원하지 않는다

#### Scenario: Home·Profile·Hashtag·Local 목록에서 Block 대상을 제외한다

- **WHEN** Block 관계의 한쪽 Profile이 Home, Profile, Hashtag 또는 Local Post List를 조회한다
- **THEN** 시스템은 상대 Profile이 작성한 Post를 후보에서 Exclude한다
- **AND** 현재 목록의 cursor/page limit 계산 전에 같은 Profile Block policy를 적용한다
- **AND** Local Timeline의 기존 PUBLIC-only 후보·cursor pagination과 selected Profile 격리는 유지한다

#### Scenario: Repost Author와 Source Author 양쪽 Block을 적용한다

- **WHEN** Repost Author 또는 Repost Source Author가 Block 관계의 상대 Profile이다
- **THEN** 시스템은 해당 Repost를 목록·검색 후보에서 Exclude한다
- **AND** 기존 Repost Post와 Bookmark 관계 자체를 삭제하지 않는다

### Requirement: Completed Local Timeline consumes Profile Block policy

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `docs/design/local-timeline.md`, `PROD-649` 완료 계약, `PROD-813`. Local Timeline은 Profile Block capability가 제공되면 기존 Local Post List 후보 정책에 Profile Block Exclude를 소비해야 한다(MUST). configured Local Instance의 PUBLIC eligible Post를 계산하는 기존 후보·정렬·pagination과 selected Profile별 Relay actor/store 격리를 변경하지 않고(MUST), 차단 대상 Author 또는 Repost Source Author의 Post만 공통 policy로 제외해야 한다(MUST).

#### Scenario: Local Timeline에서 차단 대상 Author를 제외한다

- **WHEN** selected Profile이 Local Timeline을 조회하고 configured Local Instance의 PUBLIC eligible Post 중 하나의 Author가 차단 대상이다
- **THEN** 시스템은 해당 Post를 Local connection 후보에서 제외한다
- **AND** 같은 페이지의 차단되지 않은 eligible Post는 기존 immutable cursor 순서로 반환한다

#### Scenario: Local Timeline에서 차단 대상 Repost Source Author를 제외한다

- **WHEN** Local Timeline 후보 Repost의 Source Post Author가 selected Profile의 Profile Block 대상이다
- **THEN** 시스템은 Repost Author가 차단되지 않았더라도 해당 Repost를 제외한다
- **AND** Post·Bookmark 저장 상태와 Local Timeline의 cursor contract를 변경하지 않는다

#### Scenario: Local Timeline selected Profile 전환을 격리한다

- **WHEN** 사용자가 selected Profile A에서 Profile B로 전환한 뒤 Local Timeline을 다시 요청한다
- **THEN** 시스템은 A의 Block policy, connection edge와 cursor를 B의 요청에 재사용하지 않는다
- **AND** B의 현재 Profile Block 관계를 새 요청에서 적용한다
