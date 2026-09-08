## ADDED Requirements

### Requirement: Profile Block applies directional Post and Media access

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/post.md`, `docs/domain/objects/media.md`, `docs/domain/policies/post-list.md`, `PROD-822`. Post object·Post detail·Media relation과 Profile Post List는 기존 Post Visibility·Post Eligibility·Media 조회 정책과 Profile Block의 viewer 방향을 함께 적용해야 한다(MUST). Owner Profile이 Target Profile의 콘텐츠를 조회하는 경우에는 기존 콘텐츠 정책을 충족한 Post와 첨부 Media를 제공해야 하며(MUST), Target Profile이 Owner Profile의 콘텐츠를 조회하는 경우에는 모든 직접 콘텐츠 API 경로에 차단 정책을 적용해야 한다(MUST). 양방향 Block이면 양쪽 viewer의 직접 콘텐츠 API 경로에 차단 정책을 적용해야 한다(MUST).

#### Scenario: 역방향 Block이 없을 때 Owner가 Target의 허용된 Post와 Media를 직접 조회한다

- **WHEN** Owner → Target Profile Block이 존재하고 Target → Owner Profile Block은 없으며 Owner가 Target Profile의 Post List, Post detail 또는 첨부 Media를 조회한다
- **THEN** 시스템은 기존 Post Visibility·Post Eligibility·Media 조회 정책을 충족하는 Target의 Post와 첨부 Media를 반환한다
- **AND** 직접 API 조회는 같은 기존 Post·Media 정책으로 판정한다

#### Scenario: Target이 Owner의 Post와 Media를 직접 조회한다

- **WHEN** Owner → Target Profile Block이 존재하고 Target이 Owner Profile의 Post List, Post detail 또는 첨부 Media를 조회한다
- **THEN** 시스템은 Profile Block의 콘텐츠 차단 정책을 적용해 해당 Post와 첨부 Media의 직접 조회 결과를 제한한다

#### Scenario: 양방향 Block에서 양쪽 콘텐츠 조회를 제한한다

- **WHEN** 두 Profile 사이에 양방향 Profile Block이 존재하고 어느 한쪽이 상대 Profile의 Post List, Post detail 또는 첨부 Media를 조회한다
- **THEN** 시스템은 양쪽 viewer의 직접 콘텐츠 API 경로에 Profile Block 콘텐츠 차단 정책을 적용한다

### Requirement: Profile Block filters shared content lists in both directions

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-822`. Home·Local·Hashtag Post List와 Post 콘텐츠 검색은 Profile Block 관계의 양쪽 viewer 방향에서 상대 Profile의 콘텐츠를 필터링해야 한다(MUST). Profile Post List는 방향별 Post 조회 정책에 따라 Owner → Target 콘텐츠를 제공하고 Target → Owner 콘텐츠를 제한해야 한다(MUST). 목록 필터는 기존 Post Visibility·Eligibility와 후보 정렬을 적용한 뒤 cursor·page limit 계산 전에 수행해야 한다(MUST).

#### Scenario: 탐색 목록과 Post 검색에서 상대 콘텐츠를 필터링한다

- **WHEN** Profile Block 관계의 한쪽 Profile이 Home, Local, Hashtag Post List 또는 Post 콘텐츠 검색을 조회한다
- **THEN** 시스템은 상대 Profile이 작성한 콘텐츠를 해당 결과에서 양방향으로 필터링한다
- **AND** 다음 eligible Post로 페이지를 채우고 cursor·pageInfo를 계산한다

#### Scenario: Profile Post List는 viewer 방향에 따라 콘텐츠를 제공한다

- **WHEN** Owner → Target Profile Block 관계만 존재하고 Target → Owner Profile Block은 없으며 어느 한쪽 Profile이 상대 Profile의 `posts` connection을 직접 조회한다
- **THEN** Owner → Target 조회는 기존 Post Visibility·Post Eligibility를 충족하는 콘텐츠를 제공한다
- **AND** Target → Owner 조회는 Profile Block 콘텐츠 차단 정책을 적용한다

#### Scenario: Repost Author와 Source Author를 함께 판정한다

- **WHEN** Home, Local, Hashtag 또는 Post 검색 후보가 Repost Source를 가지고 있다
- **THEN** 시스템은 바깥 Post Author와 direct Source Post Author 양쪽의 Profile Block 관계를 판정한다
- **AND** 상대 Profile과 연결된 후보를 cursor·page limit 계산 전에 필터링한다

### Requirement: Profile Block protects Post interactions in both directions

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0012-post-interaction-followup-clarifications.md`, `PROD-822`. Post surface의 새 Reply·Quote·Reaction·Repost 입력은 Profile Block의 양쪽 viewer 방향에 따라 거부해야 한다(MUST). Profile Block으로 거부된 입력의 기존 보존 대상 Post·Reaction·Repost·Bookmark 상태는 유지해야 한다(MUST).

#### Scenario: 차단된 상대를 향한 새 Post interaction을 거부한다

- **WHEN** Block 관계의 Owner 또는 Target이 상대 Profile의 Post에 Reply·Quote·Reaction·Repost를 새로 입력한다
- **THEN** 시스템은 Profile Block interaction 정책에 따라 입력을 거부한다
- **AND** 해당 입력의 결과로 새 Post·Reaction·Repost row를 저장하지 않는다

#### Scenario: 차단과 무관한 기존 Post 상태를 보존한다

- **WHEN** Profile Block을 생성하거나 해제한다
- **THEN** 시스템은 기존 Repost Post와 Bookmark 관계를 보존한다
