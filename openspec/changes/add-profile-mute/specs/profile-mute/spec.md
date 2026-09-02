## ADDED Requirements

### Requirement: 영구 Profile Mute 관계를 저장한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-814`, `PROD-824` — 시스템은 Profile Mute를 Owner Profile에서 Target Profile로 향하는 별도 관계로 저장해야 한다(MUST). 각 관계는 Owner와 Target을 하나씩 정확히 참조하며, 같은 Owner·Target 조합에는 하나만 존재해야 한다(MUST). 저장 모델에는 nullable `expires_at`을 포함하되, 이 변경에서 제공하는 모든 생성 경로는 영구 Mute를 뜻하는 `null`만 기록해야 한다(MUST). 기간이나 만료 시각을 받거나 만료 시각을 바꾸는 입력은 공개해서는 안 된다(MUST NOT).

#### Scenario: 영구 Mute를 저장한다

- **WHEN** 유효한 Owner Profile이 아직 Mute하지 않은 Target Profile을 Mute한다
- **THEN** 시스템은 두 Profile을 잇는 관계를 하나 생성하고 `expires_at`에 `null`을 저장한다

#### Scenario: 기간 지정 입력을 제공하지 않는다

- **WHEN** 클라이언트가 이 변경에서 추가한 Core 또는 GraphQL 생성 계약을 확인한다
- **THEN** 기간이나 만료 시각을 전달하거나 기존 관계의 만료 시각을 바꾸는 입력은 존재하지 않는다

### Requirement: 행동 자격과 Target 경계를 검증한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `PROD-814`, `PROD-824` — Profile Mute를 만드는 Owner는 Active Account가 선택한 Active·Normal Local Profile이어야 하며 Target Profile과 달라야 한다(MUST). Target에는 저장된 Local Profile과 Remote Profile을 모두 지정할 수 있어야 한다(MUST). Core action은 검증된 Owner Profile identity를 받아 행동 고유 조건과 Target 존재 여부를 확인해야 한다(MUST). HTTP나 GraphQL transport 상태에 의존해서는 안 된다(MUST NOT).

#### Scenario: Local Target을 Mute한다

- **WHEN** 자격을 갖춘 Owner가 자신과 다른 Local Profile을 Target으로 지정한다
- **THEN** 시스템은 영구 Profile Mute 관계를 생성한다

#### Scenario: Remote Target을 Mute한다

- **WHEN** 자격을 갖춘 Owner가 저장된 Remote Profile을 Target으로 지정한다
- **THEN** 시스템은 Local Target과 같은 Profile Mute 관계를 생성한다

#### Scenario: 자기 자신은 Mute할 수 없다

- **WHEN** Owner와 Target이 같은 Profile이다
- **THEN** 시스템은 요청을 거부하고 Profile Mute 관계를 만들지 않는다

#### Scenario: 자격이 없는 Owner는 Mute할 수 없다

- **WHEN** Owner가 Active·Normal Local Profile 조건을 충족하지 않는다
- **THEN** 시스템은 요청을 거부하고 Profile Mute 관계를 만들지 않는다

### Requirement: 중복 생성은 하나의 관계로 수렴한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `PROD-814`, `PROD-824` — 시스템은 Owner·Target 조합의 고유성을 데이터베이스에서 보장해야 한다(MUST). 같은 조합을 순차 또는 동시에 여러 번 생성해도 관계는 하나만 남아야 한다(MUST). 생성 action은 이미 존재하는 관계를 성공 결과로 반환해야 한다(MUST). 중복을 막으려고 Profile row나 관계 row를 비관적으로 잠가서는 안 된다(MUST NOT).

#### Scenario: 같은 Mute를 다시 생성한다

- **WHEN** 이미 존재하는 Owner·Target 조합으로 생성 action을 다시 실행한다
- **THEN** 시스템은 새 row를 만들지 않고 기존 Profile Mute를 반환한다

#### Scenario: 같은 Mute를 동시에 생성한다

- **WHEN** 같은 Owner·Target 조합의 생성 요청이 동시에 실행된다
- **THEN** 모든 성공 결과는 데이터베이스에 남은 하나의 Profile Mute 관계로 수렴한다

### Requirement: Owner가 Profile Mute를 해제한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824` — 검증된 Owner Profile은 자신이 소유한 Profile Mute를 제거할 수 있어야 한다(MUST). Target이나 다른 Owner가 만든 관계는 제거할 수 없어야 한다(MUST). 제거된 관계를 적용 중인 Mute로 판정하거나 Owner의 관리 목록에 포함해서는 안 된다(MUST NOT).

#### Scenario: 소유한 Mute를 해제한다

- **WHEN** Owner가 자신이 만든 Profile Mute를 해제한다
- **THEN** 시스템은 해당 관계를 제거하고 더 이상 적용 중인 Mute로 반환하지 않는다

#### Scenario: 다른 Owner의 Mute는 해제할 수 없다

- **WHEN** 선택한 Profile이 다른 Owner의 Profile Mute를 제거하려 한다
- **THEN** 시스템은 기존 관계를 유지하며 그 관계의 존재를 요청자에게 드러내지 않는다

### Requirement: Profile Mute 적용 여부를 조회한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/policies/post-list.md`, `PROD-814`, `PROD-824` — 시스템은 주어진 Owner·Target 조합에 이 변경의 영구 Profile Mute 관계가 존재하는지 transport와 무관하게 판정할 수 있어야 한다(MUST). 후행 콘텐츠·Notification 정책은 이 공통 조회 경계를 사용할 수 있어야 한다(MUST). 이 변경 자체가 Post 목록을 제외·접거나 Notification 생성을 억제해서는 안 된다(MUST NOT).

#### Scenario: 관계가 있으면 적용 중이다

- **WHEN** Owner·Target 조합에 `expires_at`이 `null`인 Profile Mute가 존재한다
- **THEN** 적용 여부 조회는 Mute가 적용 중이라고 반환한다

#### Scenario: 관계가 없으면 적용 중이 아니다

- **WHEN** Owner·Target 조합에 Profile Mute가 존재하지 않는다
- **THEN** 적용 여부 조회는 Mute가 적용 중이 아니라고 반환한다

#### Scenario: 후행 노출 정책은 실행하지 않는다

- **WHEN** Profile Mute를 만들거나 조회한다
- **THEN** 이 변경은 Home·Hashtag·Target Profile Post List의 결과나 Notification 생성 여부를 직접 바꾸지 않는다

### Requirement: Owner 전용 GraphQL 조회 계약을 제공한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824` — GraphQL은 Profile Mute를 Node로 식별할 수 있게 하고, 현재 selected Profile이 소유한 관계를 Relay connection으로 조회할 수 있어야 한다(MUST). 각 항목에서는 Target Profile을 조회할 수 있어야 한다(MUST). Target Profile에는 현재 selected Profile이 해당 Target을 Mute했는지 확인하는 viewer-relative 상태를 제공해야 한다(MUST). 관계와 목록, viewer-relative 상태는 Owner에게만 보여야 하며(MUST), 기간 또는 만료 시각 필드는 이 변경의 공개 schema에 포함해서는 안 된다(MUST NOT).

#### Scenario: 현재 Profile의 Mute 목록을 조회한다

- **WHEN** 인증된 요청이 현재 selected Profile의 Profile Mute connection을 조회한다
- **THEN** 시스템은 그 Profile이 소유한 관계와 각 Target을 안정적으로 페이지네이션해 반환한다

#### Scenario: Target의 viewer-relative 상태를 조회한다

- **WHEN** 현재 selected Profile이 Mute한 Target Profile을 조회한다
- **THEN** 시스템은 현재 Owner에게 해당 Profile Mute 관계를 반환한다

#### Scenario: 다른 Profile의 목록은 볼 수 없다

- **WHEN** 요청자가 다른 Account의 Profile 또는 같은 Account의 다른 Profile이 소유한 Mute connection을 조회하려 한다
- **THEN** 시스템은 관계와 목록을 공개하지 않는다

#### Scenario: Target에게 관계를 공개하지 않는다

- **WHEN** Target Profile을 선택한 요청이 자신을 Target으로 삼은 Mute를 조회하려 한다
- **THEN** 시스템은 해당 Profile Mute의 존재를 공개하지 않는다

### Requirement: GraphQL 생성·해제는 selected Profile에 귀속한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/design/profile-mute-block.md`, `PROD-814`, `PROD-824` — GraphQL은 Target Profile을 지정해 영구 Mute를 만들고 해제하는 mutation을 제공해야 한다(MUST). 두 mutation의 Owner는 인증된 요청의 현재 selected Profile로만 정해야 한다(MUST). 클라이언트가 별도 Owner identity를 지정하게 해서는 안 된다(MUST NOT). mutation은 `usingProfile` 경계에서 Active Account, selected Profile Membership과 조회 가능 상태를 검증한 뒤 transport-neutral Core action을 호출해야 한다(MUST).

#### Scenario: selected Profile로 Mute를 생성한다

- **WHEN** 인증된 요청이 Target Profile을 지정해 생성 mutation을 실행한다
- **THEN** 시스템은 현재 selected Profile을 Owner로 사용해 Core action을 실행하고 생성되거나 기존에 있던 관계를 반환한다

#### Scenario: selected Profile로 Mute를 해제한다

- **WHEN** 인증된 요청이 현재 selected Profile이 Mute한 Target을 지정해 해제 mutation을 실행한다
- **THEN** 시스템은 현재 selected Profile이 소유한 관계만 제거하고 제거한 관계의 식별자를 반환한다

#### Scenario: selected Profile이 바뀌면 관계도 격리된다

- **WHEN** 같은 Account가 다른 Profile을 선택한 뒤 이전 selected Profile의 Target을 조회하거나 해제 mutation을 실행한다
- **THEN** 시스템은 새 selected Profile의 관계만 기준으로 처리하고 이전 Profile의 관계를 노출하거나 변경하지 않는다

### Requirement: 기존 관계와 상호작용 상태를 보존한다

**Authority / Provenance:** `docs/domain/objects/profile-mute.md`, `docs/domain/objects/notification.md`, `PROD-814`, `PROD-824` — Profile Mute를 만들거나 제거할 때 Follow Relationship, Follow Request, Reaction, Repost Post, Bookmark를 만들거나 변경하거나 제거해서는 안 된다(MUST NOT). 기존 Notification과 Read State도 바꾸지 않아야 한다(MUST NOT). Target에게 Mute 생성·제거 사실을 알리는 Notification이나 ActivityPub activity를 만들어서는 안 된다(MUST NOT).

#### Scenario: 기존 관계와 상호작용을 유지한다

- **WHEN** 다른 관계나 상호작용이 있는 Target을 Mute하거나 Mute 해제한다
- **THEN** Follow Relationship, Follow Request, Reaction, Repost Post와 Bookmark는 이전 상태를 유지한다

#### Scenario: 기존 Notification을 유지한다

- **WHEN** Target에서 발생한 기존 Notification이 있는 상태에서 Mute를 만들거나 해제한다
- **THEN** 기존 Notification과 Read State는 이전 상태를 유지한다

#### Scenario: Target에게 알리지 않는다

- **WHEN** Profile Mute를 만들거나 해제한다
- **THEN** Target에게 이를 알리는 Notification이나 ActivityPub activity가 생성되지 않는다
