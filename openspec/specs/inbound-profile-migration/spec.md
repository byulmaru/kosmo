## Purpose

검증된 ActivityPub `Move`를 Profile 단위의 준비 관계와 기존 Follow lifecycle에 연결해, 원격 source의 Local follower를 검증된 Local 또는 Remote target으로 안전하게 이전한다.

## Requirements

### Requirement: Profile Migration 준비 관계

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `docs/design/settings.md`, `PROD-743`. 시스템은 `Account.Active`와 `Profile.Owner` 권한을 통과한 사용자가 source qualified handle을 지정해 Active·Normal·Local이며 Follow Approval Policy가 Open인 target Profile에 Profile Migration을 준비할 수 있게 해야 한다(MUST). 시스템은 공개 GraphQL `registerProfileMigrationSource` mutation을 `RegisterProfileMigrationSourceInput`으로 받고 `RegisterProfileMigrationSourcePayload`를 반환해야 한다(MUST). 시스템은 source를 Remote Profile로 materialize한 뒤 Local target에서 Remote source로 향하는 준비 관계를 저장해야 하며(MUST), 하나의 Local target과 하나의 Remote source가 각각 하나의 준비 관계만 갖도록 해야 한다(MUST). 이 관계와 source 등록 성공은 inbound Move 처리 이력이나 전체 Profile 이전 이력을 의미해서는 안 된다(MUST NOT).

#### Scenario: 권한 있는 Local target에 source를 준비한다

- **WHEN** `Account.Active` 사용자가 `Profile.Owner`인 Active·Normal·Local·Open Profile을 target으로 선택하고 유효한 remote source qualified handle을 제출한다
- **THEN** 시스템은 검증된 source를 Remote Profile로 materialize한다
- **AND** Local target에서 Remote source로 향하는 Profile Migration 준비 관계를 저장한다

#### Scenario: source 등록 mutation이 준비된 target을 반환한다

- **WHEN** 권한 있는 사용자의 `registerProfileMigrationSource` mutation이 `RegisterProfileMigrationSourceInput`으로 성공한다
- **THEN** 시스템은 `RegisterProfileMigrationSourcePayload.profile`로 준비된 target Profile을 반환한다
- **AND** 반환된 target Profile의 `migrationSource` field는 등록된 Remote source Profile을 가리킨다
- **AND** source 등록은 inbound Move 처리나 전체 Profile 이전으로 간주되지 않는다

#### Scenario: 준비 조건을 통과하지 못한 target을 거부한다

- **WHEN** 요청 target이 Local이 아니거나 Active·Normal 상태가 아니거나 Follow Approval Policy가 Open이 아니거나 요청자가 Profile Owner가 아니다
- **THEN** 시스템은 Profile Migration 준비를 거부한다
- **AND** 기존 Profile과 준비 관계를 변경하지 않는다

#### Scenario: 같은 source와 target pair를 반복 지정한다

- **WHEN** 이미 같은 Local target과 Remote source pair가 준비된 상태에서 같은 요청을 다시 제출한다
- **THEN** 시스템은 요청을 no-op으로 처리한다
- **AND** 중복 준비 관계나 새로운 source identity를 만들지 않는다

#### Scenario: 다른 pair와 충돌하는 준비를 거부한다

- **WHEN** Local target에 다른 source가 준비되어 있거나 Remote source가 다른 Local target에 이미 연결된 상태에서 요청한다
- **THEN** 시스템은 충돌을 거부한다
- **AND** 기존 Profile과 준비 관계를 변경하지 않는다

### Requirement: Local Actor의 Profile Migration alias

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `docs/design/settings.md`, `PROD-743`. Local Actor의 ActivityPub `alsoKnownAs` aliases는 현재 Profile Migration 준비 관계의 Remote source canonical Actor URI에서만 파생해야 한다(MUST). 시스템은 alias를 별도 사용자 입력이나 독립적인 Profile 속성으로 저장하거나 해석해서는 안 된다(MUST NOT).

#### Scenario: 준비된 source URI를 exact alias로 제공한다

- **WHEN** Local Profile에 Remote source와의 Profile Migration 준비 관계가 존재하고 해당 Local Actor 표현을 생성한다
- **THEN** Actor의 `alsoKnownAs`에는 관계가 가리키는 Remote source canonical Actor URI가 exact 값으로 포함된다
- **AND** alias 표현은 source의 검증된 canonical identity를 사용한다

#### Scenario: 준비 관계가 없으면 migration alias를 만들지 않는다

- **WHEN** Local Profile에 Profile Migration 준비 관계가 없다
- **THEN** 시스템은 Profile Migration source를 `alsoKnownAs`에 추가하지 않는다
- **AND** 사용자 입력이나 stale client 값을 alias로 사용하지 않는다

### Requirement: Inbound ActivityPub Move identity와 target 검증

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`. 시스템은 인증된 inbound ActivityPub `Move`의 actor와 object가 같은 canonical source Actor URI일 때만 처리해야 한다(MUST). target은 canonical Actor identity로 해석해야 하며(MUST), target Actor의 `alsoKnownAs`에 exact source URI가 포함된 경우에만 검증을 통과시켜야 한다(MUST). 이 검증은 기존에 지원하는 Actor 종류에 적용하고 `Person` 종류로 한정해서는 안 된다(MUST NOT).

#### Scenario: actor와 object가 다른 Move를 거부한다

- **WHEN** 인증된 inbound `Move`의 actor URI와 object URI가 canonicalize한 뒤 서로 다르다
- **THEN** 시스템은 Move를 거부한다
- **AND** 기존 Profile Migration 관계, Follow Relationship 또는 Follow Request를 변경하지 않는다

#### Scenario: exact source alias가 없는 target을 거부한다

- **WHEN** actor와 object는 같은 canonical source URI지만 target canonical Actor의 `alsoKnownAs`에 exact source URI가 없다
- **THEN** 시스템은 Move를 거부한다
- **AND** 기존 Profile Migration 관계와 Follow lifecycle을 변경하지 않는다

#### Scenario: 검증된 remote-to-local Move를 처리한다

- **WHEN** 검증된 source가 Remote Profile이고 target이 Profile Migration 준비 관계로 연결된 Local Actor identity다
- **THEN** 시스템은 remote-to-local Move를 처리한다
- **AND** Local target의 Open Follow Approval Policy를 사용한다

#### Scenario: 준비 관계 없이 remote-to-remote Move를 처리한다

- **WHEN** 검증된 source가 Remote Profile이고 target이 canonical identity와 기존 Follow Approval Policy를 가진 Remote Profile이다
- **THEN** 시스템은 Local target의 사전 준비 관계 없이 remote-to-remote Move를 처리한다
- **AND** target Remote Profile의 기존 Follow Approval Policy를 사용한다

#### Scenario: 저장되지 않은 검증 source를 먼저 구체화한다

- **WHEN** 검증된 Move의 source Remote Profile이 아직 Kosmo에 저장되지 않았다
- **THEN** 시스템은 검증된 원격 actor를 Remote Profile로 materialize한 뒤 Move 처리를 시작한다
- **AND** 검증되지 않은 actor를 Profile identity로 저장하지 않는다

### Requirement: Inbound Move의 Follow 이전 순서와 대상 범위

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`. 시스템은 source Profile을 Followee로 가진 기존 established Follow Relationship 중 Follower가 Local Profile인 관계만 이전해야 한다(MUST). 각 관계는 target의 기존 Follow Approval Policy에 따라 target Follow Relationship 또는 Follow Request를 먼저 성공적으로 저장한 뒤 기존 Follow removal/Unfollow·Undo lifecycle로 source Follow Relationship을 제거해야 하며(MUST), target 저장이 실패한 경우 source 관계를 먼저 제거해서는 안 된다(MUST NOT). Remote target의 Open policy도 기존 Local-to-Remote Follow effect semantics를 사용하며, Move 완료를 원격 HTTP receipt 도착에 묶어서는 안 된다(MUST NOT). 이 순서는 remote-to-local과 remote-to-remote target에 동일하게 적용해야 한다(MUST).

#### Scenario: Open Local target으로 Local follower를 이전한다

- **WHEN** 검증된 Move에 source Followee와 established Follow를 가진 Local Follower가 있고 target Local Profile의 policy가 Open이다
- **THEN** 시스템은 target Follow Relationship을 먼저 저장한다
- **AND** target 저장이 성공한 뒤 source Follow Relationship을 제거한다

#### Scenario: Approval Required target에는 Follow Request를 만든다

- **WHEN** 검증된 Move에 source Followee와 established Follow를 가진 Local Follower가 있고 target Profile의 policy가 Approval Required이다
- **THEN** 시스템은 target Follow Request를 먼저 저장한다
- **AND** target Request 저장이 성공한 뒤 source Follow Relationship을 제거한다

#### Scenario: Remote target의 기존 Follow effect lifecycle을 사용한다

- **WHEN** 검증된 Move의 target이 Remote Profile이고 target의 기존 policy가 Open이다
- **THEN** 시스템은 Local follower에서 Remote target으로 향하는 기존 Follow Relationship 및 Local-to-Remote effect lifecycle을 사용한다
- **AND** target 관계가 commit된 뒤 source Follow Relationship을 기존 removal/Unfollow·Undo lifecycle로 제거한다
- **AND** 원격 HTTP delivery receipt의 도착 여부를 source 제거의 추가 조건으로 사용하지 않는다

#### Scenario: Remote target의 Approval Required lifecycle을 사용한다

- **WHEN** 검증된 Move의 target이 Remote Profile이고 target의 기존 policy가 Approval Required이다
- **THEN** 시스템은 기존 Follow Request lifecycle에 따라 target Request를 저장한다
- **AND** target Request가 성공적으로 저장된 뒤 source Follow Relationship을 제거한다

#### Scenario: Local follower가 아닌 관계는 이전하지 않는다

- **WHEN** source를 Followee로 가진 관계의 Follower가 Local Profile이 아니거나 관계가 established Follow가 아니다
- **THEN** 시스템은 해당 관계를 Inbound Move 이전 대상에 포함하지 않는다
- **AND** 그 관계를 target Follow·Request로 복사하거나 source 관계를 이전 목적으로 제거하지 않는다

#### Scenario: target 저장 실패에서 source 관계를 보존한다

- **WHEN** 이전 대상 관계의 target Follow Relationship 또는 Follow Request 저장이 실패한다
- **THEN** 시스템은 해당 source Follow Relationship을 제거하지 않는다
- **AND** 실패 결과는 재시도 가능한 상태로 남긴다

#### Scenario: 이미 존재하는 target lifecycle에 수렴한다

- **WHEN** 같은 follower와 target 사이에 target Follow Relationship 또는 Pending Follow Request가 이미 존재한 상태로 같은 Move가 반복된다
- **THEN** 시스템은 기존 Follow·Follow Request lifecycle의 멱등성에 따라 중복 row를 만들지 않는다
- **AND** target 상태가 확정된 뒤 source 관계 제거를 재개할 수 있다

### Requirement: Inbound Move 재시도와 보장 경계

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/decisions/0027-profile-migration-inbound-move.md`, `PROD-743`. 시스템은 같은 source·target identity와 기존 Follow·Follow Request lifecycle의 멱등성 및 재시도를 사용해 반복 수신을 최종 상태로 수렴시켜야 한다(MUST). 중단된 이전은 기존 Temporal 재시도로 재개해야 하며(MUST). 이 change는 서버 간 receipt 도착 순서나 동시 Follow/Unfollow 결과를 추가로 보장해서는 안 된다(MUST NOT).

#### Scenario: 같은 Move를 반복 수신한다

- **WHEN** 동일한 canonical source와 target을 가리키는 `Move`가 한 번 처리된 뒤 다시 수신된다
- **THEN** 시스템은 기존 Profile identity와 Follow·Follow Request 상태를 사용해 중복 없이 같은 결과로 수렴한다
- **AND** target이 이미 저장된 이전에는 source Follow Relationship의 제거 단계를 재실행해도 중복 target row를 만들지 않는다

#### Scenario: target 저장 뒤 처리 중단을 재개한다

- **WHEN** target Follow Relationship 또는 Follow Request 저장 뒤 source 제거 전에 이전 실행이 중단된다
- **THEN** 기존 Temporal 재시도는 target의 확정 상태를 확인해 source 제거 단계를 재개할 수 있다
- **AND** target 저장 실패로 source를 먼저 제거하는 부분 성공을 만들지 않는다

#### Scenario: receipt 순서와 Follow/Unfollow race를 별도 보장으로 승격하지 않는다

- **WHEN** 서로 다른 서버에서 온 Move receipt의 도착 순서가 바뀌거나 Follow와 Unfollow가 동시에 실행된다
- **THEN** 시스템은 기존 Profile·Follow lifecycle의 결과를 사용한다
- **AND** 서버 간 receipt 순서와 동시 race에 대해 이 change가 정한 추가 결과를 약속하지 않는다
