## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `notification_follow`, `notification_item`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `profile_follow_request`, `session` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

## ADDED Requirements

### Requirement: Notification Item 공통 저장

시스템은 Profile-scoped Notification Item의 공통 identity, Recipient, 생성 시각과 최초 Read 시각을 `notification_item`에 저장해야 한다(MUST).

#### Scenario: Follow Notification base row 저장

- **WHEN** Follow Notification Item을 생성한다
- **THEN** 시스템은 `notification_item`에 UUID v8 `id`, `recipient_profile_id`, `created_at`, nullable `read_at`을 저장한다
- **AND** `notification_item.id`는 `NotificationItem` Relay Node의 `TableDiscriminator`를 가진다
- **AND** `read_at = null`은 Unread를, non-null `read_at`은 Read와 최초 Read 시각을 나타낸다
- **AND** 별도 Notification Type·Read State DB enum, 미래 source column이나 mutable `updated_at`을 저장하지 않는다

#### Scenario: Recipient Profile row 물리 삭제

- **WHEN** Recipient Profile row가 물리적으로 삭제된다
- **THEN** 해당 Profile의 `notification_item` 행은 foreign key cascade로 삭제된다

#### Scenario: Recipient inbox 조회 index

- **WHEN** migration이 Notification Item schema를 생성한다
- **THEN** 시스템은 `(recipient_profile_id, id DESC)` 목록 index를 생성한다
- **AND** `read_at IS NULL`인 행에 대해 `(recipient_profile_id)` partial index를 생성한다
- **AND** 목록과 Unread count는 `created_at`을 중복 정렬 key로 사용하지 않는다

### Requirement: Follow Notification source 저장

시스템은 Follow Notification Item과 established `ProfileFollow` source의 1:1 mapping을 `notification_follow` type-specific table에 저장하고 source 삭제 시 base item까지 정리해야 한다(MUST). `FOLLOW` type은 이 extension row의 존재로 판별해야 한다(MUST).

#### Scenario: Follow source mapping 저장

- **WHEN** Follow Notification Item을 저장한다
- **THEN** 시스템은 `notification_follow`에 자체 UUID v8 `id` primary key와 전용 `TableDiscriminator`를 저장한다
- **AND** `notification_follow.notification_item_id`를 non-null unique `notification_item.id` foreign key로 저장한다
- **AND** `notification_follow.profile_follow_id`를 non-null unique `profile_follow.id` foreign key로 저장한다
- **AND** mapping과 base item은 하나의 transaction에서 함께 생성된다
- **AND** API의 `NotificationType.FOLLOW`는 `notification_follow` extension 존재에서 파생한다

#### Scenario: 동일 source 직접 중복 insert

- **WHEN** 같은 `profile_follow_id`로 두 번째 `notification_follow` mapping을 직접 저장하려 한다
- **THEN** database unique constraint는 insert를 거부한다

#### Scenario: base item 삭제

- **WHEN** `notification_item` base row가 삭제된다
- **THEN** `notification_item_id` foreign key cascade가 대응하는 `notification_follow` mapping을 삭제한다

#### Scenario: Follow source 삭제

- **WHEN** `profile_follow` source가 삭제된다
- **THEN** source foreign key cascade는 대응하는 `notification_follow` mapping을 삭제한다
- **AND** type-specific mapping cleanup trigger는 대응하는 `notification_item` base row를 삭제한다
- **AND** orphan base item이나 mapping이 남지 않는다

#### Scenario: type-specific mapping 직접 삭제

- **WHEN** `notification_follow` mapping을 직접 삭제한다
- **THEN** mapping cleanup trigger는 대응하는 `notification_item` base row도 삭제한다
- **AND** base row 삭제로 시작된 cascade에서 trigger의 반복 parent delete는 zero-row no-op으로 끝난다

#### Scenario: Follow source extension integrity

- **WHEN** `notification_item`과 type-specific extension을 생성하거나 extension을 직접 제거하는 transaction이 commit된다
- **THEN** deferred integrity constraint는 살아 있는 base item마다 정확히 하나의 지원 type extension이 존재하는지 검증한다
- **AND** 이번 capability에서는 그 extension이 `notification_follow`이다

#### Scenario: 후속 Notification source type 확장

- **WHEN** 후속 change가 새 Notification Type을 구현한다
- **THEN** 그 change는 새 GraphQL enum value와 별도 type-specific source table, 자체 ID discriminator, unique item/source foreign key, type integrity와 source cleanup을 함께 추가한다
- **AND** 기존 base table에 미래 source용 nullable foreign key를 선제 추가하지 않는다
