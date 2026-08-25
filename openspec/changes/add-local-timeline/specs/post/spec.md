## ADDED Requirements

### Requirement: Local timeline connection

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `PROD-649` — The API SHALL selected Profile이 있는 인증 요청에 configured Local Instance의 Local Post List를 최신순 Relay
connection `Query.localTimeline`으로 제공한다. connection은 공용 `PostConnection`을 사용하고 page size를 최대
20개로 제한해야 한다(MUST). 인증되지 않았거나 selected Profile이 없으면 요청을 거부하지 않고 `null`을 반환해야
한다(MUST).

#### Scenario: Local connection access

- **WHEN** selected Profile이 있는 인증자가 `localTimeline`을 조회한다
- **THEN** 시스템은 최대 20개의 edge와 cursor 기반 `pageInfo`를 가진 `PostConnection`을 반환한다

#### Scenario: Missing Local actor

- **WHEN** 인증되지 않았거나 selected Profile이 없는 클라이언트가 `localTimeline`을 조회한다
- **THEN** 시스템은 요청을 거부하지 않고 `localTimeline` 필드로 `null`을 반환한다

### Requirement: Local timeline candidate policy

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `PROD-649` — The API SHALL Local connection에 configured Local Instance의 Active/Normal Local Profile이 작성한 Public Post 중
Content가 있고 Reply Parent가 없는 eligible Post를 포함한다. Content와 Repost Source가 함께 있는 Quote는
포함하고, 원격 작성자, Public이 아닌 Post, Reply와 Content 없는 Repost는 page limit 전에 제외해야 한다(MUST).

#### Scenario: Include Local Content Post and Quote

- **WHEN** configured Local Instance의 Active/Normal Local Profile이 Public Content Post 또는 Public Quote를 작성한다
- **THEN** 시스템은 Post Visibility와 Eligibility를 통과한 해당 Post를 Local 후보에 포함한다

#### Scenario: Exclude non-Local candidates before pagination

- **WHEN** Post가 원격 Profile 작성, Public이 아닌 Visibility, Reply Parent 있음 또는 Content 없는 Repost 조건 중 하나를 가진다
- **THEN** 시스템은 page limit을 적용하기 전에 해당 Post를 Local 후보에서 제외한다

### Requirement: Local timeline runtime controls

**Authority / Provenance:** `docs/domain/policies/post-list.md`, `PROD-649` — The API SHALL Local connection에 현재 runtime이 제공하는 Post Visibility·Eligibility와 Sensitive Media·조회할
수 없는 Media 정책을 기존 Post 표시 경계에서 적용한다. Profile Block과 Profile Mute의 canonical 결정은 Exclude로
유지하되, PROD-813/814가 해당 runtime capability를 제공하기 전에는 Local 전용 client filter나 부분 모델을
추가해서는 안 된다(MUST NOT).

#### Scenario: Reuse current Post access policy

- **WHEN** Local 후보가 현재 runtime의 Visibility 또는 Eligibility를 통과하지 못하거나 조회할 수 없는 Media만 가진다
- **THEN** 시스템은 기존 Post 접근·표시 정책과 같은 결과를 적용한다

#### Scenario: Preserve deferred Block and Mute boundary

- **WHEN** PROD-813/814의 Profile Block 또는 Profile Mute runtime capability가 아직 제공되지 않는다
- **THEN** 시스템은 Local client에서 해당 제어를 추정하거나 별도 상태로 구현하지 않는다
