## ADDED Requirements

### Requirement: Home Post List는 Profile Mute Target의 후보를 page limit 전에 제외한다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-814`, `PROD-825`

현재 selected Profile이 Owner인 영구 Profile Mute가 존재하면 Home Post List는 Target Profile이 작성한 후보를 제외해야 한다(MUST).
이 판정은 기존 Post Visibility와 Post Eligibility를 통과한 후보에 적용하며(MUST),
page limit과 cursor를 계산하기 전에 끝나야 한다(MUST). Profile Mute가 기존 Post Visibility나 Post
Eligibility의 접근 범위를 넓혀서는 안 된다(MUST NOT).

#### Scenario: Mute Target의 Content Post를 제외한다

- **WHEN** 현재 selected Profile이 Mute한 Target Profile의 Content Post가 Home 후보가 된다
- **THEN** 시스템은 page limit을 적용하기 전에 해당 Post를 Home 후보에서 제외한다

#### Scenario: Mute Target의 Reply 후보를 제외한다

- **WHEN** 현재 selected Profile이 Mute한 Target Profile이 작성한 Reply가 기존 Home 후보 정책을 통과한다
- **THEN** 시스템은 Reply Parent의 Author와 관계없이 해당 Reply를 page limit 적용 전에 제외한다

#### Scenario: 제외한 후보 뒤의 Post로 페이지를 채운다

- **WHEN** 최신순 후보 사이에 Profile Mute로 제외할 Post가 있고 그 뒤에 포함 가능한 Post가 더 있다
- **THEN** 시스템은 Mute 판정을 끝낸 뒤 page limit과 cursor를 적용한다
- **AND** 제외된 Post 때문에 요청한 페이지 크기가 인위적으로 줄어들지 않는다

### Requirement: Home Repost는 Repost Author와 Source Post Author의 Profile Mute를 모두 판정한다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-814`, `PROD-825`

Home 후보가 Repost Source를 가지면 시스템은 바깥 Post의 Author와 direct Source Post Author에 대한 현재 selected Profile의 영구 Profile Mute를 각각 판정해야 한다(MUST).
둘 중 하나라도 Mute Target이면 Content가 없는 Repost와 Content가 있는 Quote를 모두 Home
후보에서 제외해야 한다(MUST). 두 Author가 모두 Mute Target이 아닐 때는 기존 Repost·Quote Visibility와
Eligibility 결과를 유지해야 한다(MUST).

#### Scenario: Mute Target이 만든 Repost를 제외한다

- **WHEN** Home 후보의 Repost Author가 현재 selected Profile의 Mute Target이다
- **THEN** 시스템은 Source Post Author의 Mute 여부와 관계없이 바깥 Post를 page limit 적용 전에 제외한다

#### Scenario: Mute Target의 Source를 가진 Repost와 Quote를 제외한다

- **WHEN** Home 후보의 Repost Author는 Mute Target이 아니지만 direct Source Post Author가 Mute Target이다
- **THEN** 시스템은 Content가 없는 Repost와 Content가 있는 Quote를 모두 page limit 적용 전에 제외한다

#### Scenario: 두 Author가 모두 Mute Target이 아니면 기존 결과를 유지한다

- **WHEN** Repost Author와 direct Source Post Author가 모두 현재 selected Profile의 Mute Target이 아니다
- **THEN** 시스템은 기존 Home Repost·Quote Visibility와 Eligibility 결과를 그대로 적용한다

### Requirement: Profile Post List는 방문한 Profile만 Mute 예외로 허용한다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-825`

`Profile.posts`는 방문한 Profile ID만 현재 selected Profile의 Mute 예외로 허용해야 한다(MUST).
다른 Mute Target이 direct Source Author인 Repost·Quote는 cursor·limit 전에 제외해야 한다(MUST).
기존 Post Visibility·Eligibility와 `PostConnection`을 유지해야 하며(MUST), Mute 전용 Collapse·reveal이나
control decision field를 추가해서는 안 된다(MUST NOT).

#### Scenario: 방문한 muted Profile의 Post를 표시한다

- **WHEN** 현재 selected Profile이 Mute한 Profile A의 `posts` connection을 직접 조회한다
- **THEN** A가 작성한 Post는 A의 Mute 때문에 제외하지 않는다
- **AND** direct Source Author도 A이면 같은 예외를 적용한다
- **AND** 기존 Post Visibility·Eligibility를 통과해야 표시한다

#### Scenario: 다른 muted Source Author의 Repost·Quote를 제외한다

- **WHEN** Profile A의 Post가 다른 Mute Target B의 Post를 direct Source로 가진 Repost 또는 Quote이다
- **THEN** A 자체의 Mute 여부와 관계없이 해당 후보를 cursor·limit 전에 제외한다
- **AND** 제외한 후보 뒤의 eligible Post로 페이지를 채운다

#### Scenario: 비로그인 Profile 조회는 기존 접근 정책을 유지한다

- **WHEN** selected Profile이 없는 요청이 Profile의 `posts` connection을 조회한다
- **THEN** 다른 사용자의 Mute 관계를 적용하지 않고 기존 Visibility·Eligibility 결과를 반환한다

### Requirement: Local Post List는 전체 Mute를 기존 후보 정책과 함께 적용한다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `PROD-825`

Local Post List는 현재 selected Profile의 Mute Target이 outer Author 또는 direct Source Author인 후보를 cursor·limit 전에 제외해야 한다(MUST).
Content가 있는 Quote도 Source Author를 판정해야 한다(MUST).
configured Local Instance, Public, Content 있음, Reply Parent 없음과 기존 Visibility·Eligibility 조건을
유지해야 하며(MUST), Content 없는 Repost를 새 후보로 허용해서는 안 된다(MUST NOT).

#### Scenario: muted Author의 일반 Post와 Quote를 제외한다

- **WHEN** Local 후보의 outer Author 또는 Quote의 direct Source Author가 Mute Target이다
- **THEN** 해당 후보를 cursor·limit 전에 제외한다
- **AND** 다음 eligible Post로 페이지를 채우고 양방향 cursor와 pageInfo를 계산한다

#### Scenario: Mute 예외가 Local 고유 후보 정책을 넓히지 않는다

- **WHEN** Content 없는 Repost나 Reply가 두 Author 모두 Mute하지 않은 Post이다
- **THEN** 기존 Local 후보 정책에 따라 계속 제외한다

### Requirement: Bookmark와 Post 직접 조회·상호작용은 Mute를 무시한다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `PROD-825`

Bookmark 목록과 생성, Post Node 직접 조회와 상호작용은 Mute 전체 무시를 명시해야 한다(MUST).
Mute가 Visibility·Eligibility 검사나 Bookmark Owner 권한을 대신해서는 안 된다(MUST NOT).

#### Scenario: muted Author와 Source를 가진 Bookmark를 유지한다

- **WHEN** 현재 selected Profile의 Bookmark가 muted Author 또는 muted direct Source Author의 Post를 참조한다
- **THEN** Mute 때문에 Bookmark나 그 Post를 제외하지 않는다
- **AND** 기존 Visibility·Eligibility와 Bookmark Owner 조건은 계속 적용한다

#### Scenario: Mute한 Post를 직접 조회하거나 Bookmark한다

- **WHEN** 현재 selected Profile이 Mute한 Author 또는 Source의 Post를 Node로 조회하거나 Bookmark한다
- **THEN** Mute와 무관하게 기존 접근 가능한 Post를 조회하거나 Bookmark할 수 있다

### Requirement: Post List의 Profile Mute 판정은 selected Profile과 새 조회 시점을 따른다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/policies/post-list.md`, `PROD-814`, `PROD-825`

인증된 Post List 조회의 Profile Mute Owner는 요청의 현재 selected Profile이어야 한다(MUST).
같은 Account의 다른 Profile이 가진 Mute 관계를 조회 결과에 사용해서는 안 된다(MUST NOT).
Profile Mute를 해제한 뒤 시작한 새 조회는 제거된 관계를 적용해서는 안 된다(MUST NOT). 서버 요청 사이에
Owner별 Mute 판정 결과를 섞거나 오래된 관계를 재사용해서는 안 된다(MUST NOT).

#### Scenario: 같은 Account의 selected Profile별 결과를 격리한다

- **WHEN** 같은 Account의 Profile A는 Target을 Mute했고 Profile B는 Mute하지 않은 상태에서 각각 Home·Local·Profile을 조회한다
- **THEN** 각 요청은 자신의 Mute 관계만 적용하고 Profile 목록은 방문 ID 예외를 함께 적용한다

#### Scenario: Mute 해제 후 새 목록 조회에 반영한다

- **WHEN** 현재 selected Profile이 Target의 Profile Mute를 해제한 뒤 새 Home·Local·Profile 조회를 시작한다
- **THEN** 시스템은 제거된 관계를 적용하지 않고 각 목록의 후보 정책을 다시 계산한다

#### Scenario: Profile 방문 예외가 다른 Target의 Mute를 무시하지 않는다

- **WHEN** 같은 Account의 두 selected Profile이 서로 다른 Source Author를 Mute한 채 같은 Profile을 방문한다
- **THEN** 방문한 Profile의 Mute만 예외로 허용하고 Source Author 판정은 각 selected Profile의 관계를 따른다
