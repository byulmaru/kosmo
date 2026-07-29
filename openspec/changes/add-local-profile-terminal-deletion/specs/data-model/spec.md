## ADDED Requirements

### Requirement: Profile state compatibility migration

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-532, PROD-542, PROD-543, PROD-544 — 시스템은 legacy 단일 Profile 상태를 canonical lifecycle와 suspension으로 바꾸는 동안 구버전 workload와 rollback 대상을 보존하는 expand, transition/backfill, contract 순서를 지켜야 한다(MUST).

#### Scenario: Apply additive expand migration

- **WHEN** PROD-542 expand migration을 legacy workload가 사용하는 database에 적용한다
- **THEN** 시스템은 canonical lifecycle와 suspension을 독립적으로 저장할 additive schema만 추가한다
- **AND** legacy column·enum을 rename 또는 drop하거나 기존 값을 재해석하지 않는다
- **AND** 구버전 read/write와 현재 비활성화 행동이 계속 동작한다

#### Scenario: Map legacy states during transition

- **WHEN** PROD-543 transition workload가 legacy row를 canonical 상태로 해석하거나 backfill한다
- **THEN** legacy `ACTIVE`는 lifecycle `ACTIVE`와 suspension `NORMAL`로 대응한다
- **AND** legacy `DISABLED`는 lifecycle `DEACTIVATED`와 suspension `NORMAL`로 대응한다
- **AND** legacy `SUSPENDED`는 lifecycle `ACTIVE`와 suspension `SUSPENDED`로 대응한다
- **AND** 예상하지 못한 값은 임의 변환하지 않고 전환을 실패시킨다

#### Scenario: Preserve compatibility during mixed workload rollout

- **WHEN** 구버전과 transition workload가 같은 database를 함께 사용한다
- **THEN** transition workload는 canonical 결과와 legacy 호환 결과를 원자적으로 유지한다
- **AND** terminal Deleted는 legacy workload에서 최소한 비활성 상태로 남아 공개되거나 재비활성화되지 않는다
- **AND** backfill은 중단 후 재실행 가능하고 이미 terminal인 canonical 결과를 덮어쓰지 않는다
- **AND** 시스템은 null, mismatch와 legacy-only write를 contract gate까지 관측한다

#### Scenario: Gate contract migration

- **WHEN** PROD-544 contract migration의 merge 또는 배포를 검토한다
- **THEN** 모든 backfill이 완료되고 null·mismatch·legacy-only write가 허용 기준 안에 있어야 한다
- **AND** active·preview와 rollback 대상 구버전 workload가 drain되어야 한다
- **AND** rollback 보장 기간이 끝나고 backup/restore·rollback 절차와 production contract 승인이 있어야 한다

#### Scenario: Remove legacy state after contract approval

- **WHEN** production Contract Gate가 승인된 뒤 PROD-544를 적용한다
- **THEN** 시스템은 새 forward migration으로 canonical lifecycle와 suspension을 required authoritative state로 만든다
- **AND** legacy Profile state column·enum과 compatibility read/write를 제거한다
- **AND** 적용된 migration history를 수정하지 않는다

## MODIFIED Requirements

### Requirement: 프로필과 계정-프로필 관계 저장

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, PROD-532 — 시스템은 소셜 Profile을 Account와 분리하여 저장하고, Account와 Profile의 다대다 관계를 역할과 함께 저장해야 한다(MUST). Profile의 terminal Deleted lifecycle은 Profile row 물리 삭제와 구분해야 한다(MUST).

#### Scenario: 프로필 저장

- **WHEN** Profile이 생성된다
- **THEN** 시스템은 소속 Instance, lifecycle, suspension, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책과 생성 시각을 저장한다
- **AND** 소속 Instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** Profile lifecycle 기본값은 `ACTIVE`이다
- **AND** Profile suspension 기본값은 `NORMAL`이다

#### Scenario: 로컬 프로필 저장

- **WHEN** Local Profile이 생성된다
- **THEN** 시스템은 configured local Instance ID를 Profile의 소속 Instance로 저장한다
- **AND** Local Profile의 ActivityPub actor URI는 Profile ID 기반 `/ap/actor/{profile.id}`로 파생될 수 있다

#### Scenario: 리모트 프로필 저장

- **WHEN** Remote Profile shell이 저장된다
- **THEN** 시스템은 remote Instance ID를 Profile의 소속 Instance로 저장한다
- **AND** Remote Profile 저장은 remote follow, inbox activity 처리, remote post ingestion을 의미하지 않는다

#### Scenario: 리모트 프로필 저장 전 인스턴스 보장

- **WHEN** Remote Profile shell을 새로 저장해야 한다
- **THEN** 시스템은 normalized domain에 해당하는 ActivityPub Instance를 먼저 찾거나 생성한다
- **AND** 기존 Instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 Remote Profile shell을 저장하지 않는다

#### Scenario: 계정-프로필 역할 저장

- **WHEN** Account가 Profile에 연결된다
- **THEN** 시스템은 Account, Profile, 역할과 생성 시각을 `account_profile`에 저장한다
- **AND** 동일한 Account와 Profile 조합은 중복될 수 없다
- **AND** Account 또는 Profile row가 물리 삭제되면 관계도 함께 삭제된다
- **AND** Profile lifecycle이 Deleted로 전이하는 것만으로 Owner Membership을 삭제하지 않는다

### Requirement: 팔로우 관계 저장

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-532 — 시스템은 follower와 followee 방향을 명시하는 성립된 Profile 간 Follow 관계를 저장해야 하며, Local Profile과 ActivityPub Remote Profile이 같은 관계 모델에 참여할 수 있어야 한다(MUST). Profile lifecycle 전이는 별도 relation cleanup authority가 없는 Follow row를 삭제하지 않아야 한다(MUST).

#### Scenario: 팔로우 관계 생성

- **WHEN** 한 Profile이 다른 Profile을 follow한다
- **THEN** 시스템은 `profile_follow`에 `follower_profile_id`, `followee_profile_id`와 생성 시각을 저장한다
- **AND** `profile_follow` row 존재 자체가 성립된 Follow 관계를 의미한다
- **AND** follower 또는 followee는 Local Profile 또는 ActivityPub Remote Profile일 수 있다
- **AND** 동일한 follower와 followee 조합은 중복될 수 없다
- **AND** follower 또는 followee Profile row가 물리 삭제되면 Follow 관계도 함께 삭제된다
- **AND** Profile이 Deactivated 또는 Deleted lifecycle로 전이하는 것만으로 Follow row를 삭제하지 않는다

#### Scenario: 원격 팔로우 activity projection 추적

- **WHEN** Follow 관계가 ActivityPub Remote Profile을 포함한다
- **THEN** inbound Follow는 별도 activity identity나 actor/object metadata 없이 actor pair의 `ProfileFollow` 관계 또는 inbound `ProfileFollowRequest` 요청으로 투영해야 한다
- **AND** outbound Follow identity, actor/object URI와 generation은 established `ProfileFollow`와 저장된 actor identity에서 안정적으로 파생할 수 있어야 한다
- **AND** Accept, Reject, Undo activity identity의 durable history와 delivery ordering, retry, queue metadata는 이번 domain table 요구사항이 아니다

### Requirement: 열거형 상태 값

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-532 — 시스템은 도메인 상태와 정책 값을 제한된 enum 값으로 저장해야 한다(MUST).

#### Scenario: enum 값 사용

- **WHEN** Account, Profile, Session, OAuth token, Application, Post, Account-Profile 역할, Media, Instance, ActivityPub actor 또는 ActivityPub actor key가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** Profile lifecycle는 `ProfileLifecycleState(ACTIVE | DEACTIVATED | DELETED)`로 제한된다
- **AND** Profile suspension은 `ProfileSuspensionState(NORMAL | SUSPENDED)`로 제한된다
- **AND** 최종 contract 뒤 지원 값은 `AccountState`, `ProfileLifecycleState`, `ProfileSuspensionState`, `SessionState`, `OAuthTokenState`, `ApplicationState`, `ApplicationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `AccountProfileRole`, `MediaSource`, `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyKind`에 정의된 값으로 제한된다
