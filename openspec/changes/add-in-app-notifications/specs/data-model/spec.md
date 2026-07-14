## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `application`, `application_authorization`, `file`, `media`, `notification`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `profile_follow_request`, `session`, `instance`, `activitypub_actor`, `activitypub_actor_key` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

## ADDED Requirements

### Requirement: Notification 단일 projection 저장

시스템은 Profile-scoped Notification의 identity, Recipient, kind, loose source reference, kind-specific data, 생성 시각과 최초 Read 시각을 하나의 `notification` table에 저장해야 한다(MUST).

#### Scenario: Follow Notification row 저장

- **WHEN** Follow Notification을 생성한다
- **THEN** 시스템은 `notification`에 UUID v8 `id`, non-null `recipient_profile_id`, `kind = FOLLOW`, non-null `source_id`, `data = {}`, `created_at`과 nullable `read_at`을 저장한다
- **AND** `notification.id`는 `Notification` Relay Node의 `TableDiscriminator`를 가진다
- **AND** `read_at = null`은 Unread를, non-null `read_at`은 Read와 최초 Read 시각을 나타낸다
- **AND** `data`는 PostgreSQL `jsonb NOT NULL DEFAULT '{}'::jsonb`이며 애플리케이션이 kind별 shape를 검증한다
- **AND** 별도 Read State enum, type-specific extension table, 미래 source column이나 mutable `updated_at`을 저장하지 않는다

#### Scenario: Notification kind enum

- **WHEN** migration이 Notification schema를 생성한다
- **THEN** 시스템은 `notification_kind` enum과 현재 지원 값 `FOLLOW`를 추가한다
- **AND** API는 `notification.kind = FOLLOW`인 row를 `FollowNotification` concrete object로 해석한다
- **AND** 아직 구현하지 않는 Notification kind 값을 선제 추가하지 않는다

#### Scenario: 의도적인 loose source reference

- **WHEN** `notification.source_id`를 정의한다
- **THEN** 시스템은 이를 PostgreSQL `uuid NOT NULL`로 저장하되 source table foreign key를 만들지 않는다
- **AND** `kind`가 source table과 `data` shape를 결정한다
- **AND** FOLLOW의 `source_id`는 `profile_follow.id`를 의미하고 `data`에는 Recipient, Related Profile, 이름 또는 handle snapshot을 복제하지 않는다

#### Scenario: 동일 kind와 source와 Recipient 직접 중복 insert

- **WHEN** 같은 `(kind, source_id, recipient_profile_id)`로 두 번째 Notification을 직접 저장하려 한다
- **THEN** database unique constraint는 insert를 거부한다

#### Scenario: 같은 source의 여러 Recipient projection

- **WHEN** 후속 Profile-scoped kind가 같은 source를 서로 다른 Recipient에게 투영한다
- **THEN** database는 Recipient가 다른 Notification을 각각 저장할 수 있다

#### Scenario: Recipient Profile row 물리 삭제

- **WHEN** Recipient Profile row가 물리적으로 삭제된다
- **THEN** 해당 Profile의 `notification` 행은 `recipient_profile_id` foreign key cascade로 삭제된다

#### Scenario: Recipient inbox 조회 index

- **WHEN** migration이 Notification schema를 생성한다
- **THEN** 시스템은 `(recipient_profile_id, id DESC)` 목록 index를 생성한다
- **AND** `read_at IS NULL`인 행에 대해 `(recipient_profile_id)` partial index를 생성한다
- **AND** 목록과 Unread count는 `created_at`을 중복 정렬 key로 사용하지 않는다
- **AND** 범용 `data` 검색을 위한 GIN index를 선제 추가하지 않는다

### Requirement: Profile-scoped Notification kind 확장 경계

후속 Profile-scoped Notification kind는 같은 `notification` table에 자신의 source mapping과 최소 data shape를 추가해야 하며(MUST), 별도 extension framework를 선제 요구해서는 안 된다(MUST NOT).

#### Scenario: 후속 Profile-scoped Notification kind 추가

- **WHEN** 후속 change가 새 Profile-scoped Notification kind를 구현한다
- **THEN** 그 change는 `notification_kind` 값, GraphQL concrete object, kind resolution, 해당 kind의 `source_id` 의미와 `data` validation을 함께 정의한다
- **AND** 새 kind가 실제로 별도 durable table을 필요로 하지 않는 한 type-specific Notification extension table이나 추가 `TableDiscriminator`를 만들지 않는다

#### Scenario: Account-scoped Operational Notification

- **WHEN** 후속 change가 Recipient Account를 가진 Operational Notification을 구현한다
- **THEN** 그 change는 Account-scoped 저장 구조를 별도로 결정한다
- **AND** 이번 Profile-scoped table에 nullable `recipient_account_id`를 선제 추가하지 않는다

#### Scenario: 지원하지 않는 kind 또는 data

- **WHEN** 애플리케이션이 지원하지 않는 kind나 해당 kind의 schema와 맞지 않는 `data`로 Notification을 생성하려 한다
- **THEN** 저장 경계는 insert 전에 요청을 거부한다
- **AND** database trigger나 deferred cross-table constraint를 추가하지 않는다
