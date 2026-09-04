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

### Requirement: Target Profile Post List에는 Profile Mute를 적용하지 않는다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-825`

사용자가 Target Profile을 직접 방문해 `Profile.posts`를 조회하면 시스템은 현재 selected Profile의 Profile Mute에 따른 Control Decision을 적용해서는 안 된다(MUST NOT).
Target Profile이나 Repost Source Author가 Mute Target이어도 기존 Post Visibility, Post
Eligibility, Reply와 Repost Source 후보 정책만 적용해야 한다(MUST). `Profile.posts`는 기존
`PostConnection` 계약을 유지해야 하며(MUST), Mute 전용 Collapse·reveal 또는 control decision field를
추가해서는 안 된다(MUST NOT).

#### Scenario: Mute한 Target Profile의 Post를 정상적으로 조회한다

- **WHEN** 현재 selected Profile이 Mute한 Target Profile의 `posts` connection을 직접 조회한다
- **THEN** 시스템은 Profile Mute 때문에 Post를 접거나 제외하지 않는다
- **AND** 기존 Post Visibility와 Post Eligibility를 통과한 Post를 기존 connection 형태로 반환한다

#### Scenario: Profile Post List의 Repost Source에도 Mute를 적용하지 않는다

- **WHEN** Target Profile의 Post가 현재 selected Profile이 Mute한 Source Author의 Repost 또는 Quote이다
- **THEN** 시스템은 Profile Mute 때문에 해당 Post를 접거나 제외하지 않는다
- **AND** 기존 Repost Source 조회 가능성과 Post Eligibility만 적용한다

### Requirement: Post List의 Profile Mute 판정은 selected Profile과 새 조회 시점을 따른다

**Authority / Provenance**: `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/policies/post-list.md`, `PROD-814`, `PROD-825`

인증된 Post List 조회의 Profile Mute Owner는 요청의 현재 selected Profile이어야 한다(MUST).
같은 Account의 다른 Profile이 가진 Mute 관계를 조회 결과에 사용해서는 안 된다(MUST NOT).
Profile Mute를 해제한 뒤 시작한 새 조회는 제거된 관계를 적용해서는 안 된다(MUST NOT). 서버 요청 사이에
Owner별 Mute 판정 결과를 섞거나 오래된 관계를 재사용해서는 안 된다(MUST NOT).

#### Scenario: 같은 Account의 selected Profile별 결과를 격리한다

- **WHEN** 같은 Account의 Profile A는 Target을 Mute했고 Profile B는 Mute하지 않은 상태에서 각각 Home을 조회한다
- **THEN** Profile A의 Home은 Target 후보를 제외하고 Profile B의 Home은 기존 후보 정책 결과를 유지한다

#### Scenario: Mute 해제 후 새 Home 조회에 반영한다

- **WHEN** 현재 selected Profile이 Target의 Profile Mute를 해제한 뒤 새 Home 조회를 시작한다
- **THEN** 시스템은 제거된 관계를 적용하지 않고 기존 Home 후보 정책을 다시 계산한다

#### Scenario: Profile 직접 목록은 selected Profile이 바뀌어도 Mute 영향을 받지 않는다

- **WHEN** Target을 Mute한 Profile과 Mute하지 않은 Profile이 각각 Target의 `posts` connection을 조회한다
- **THEN** 두 요청 모두 Profile Mute와 무관하게 각 요청의 기존 Post Visibility와 Post Eligibility 결과를 반환한다
