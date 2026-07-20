## ADDED Requirements

### Requirement: Reaction Type identity 저장

시스템은 Reaction Type을 PostgreSQL enum value나 Reaction 행의 raw 문자열로 식별하지 않고 별도 `reaction_type` 테이블의 안정적인 UUID identity로 저장해야 한다(MUST).

#### Scenario: built-in Reaction Type seed

- **WHEN** Reaction schema migration을 적용한다
- **THEN** 시스템은 `reaction_type`에 UUIDv7 identity, 정확한 Unicode 표현과 생성 시각을 가진 built-in Type `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈`를 저장한다
- **AND** 각 Unicode 표현은 하나의 Reaction Type identity에만 대응한다

#### Scenario: raw Type 저장 금지

- **WHEN** Reaction을 저장한다
- **THEN** `reaction`은 `reaction_type.id`를 참조한다
- **AND** Reaction 행에 emoji 문자열이나 PostgreSQL enum value를 중복 저장하지 않는다

#### Scenario: future custom emoji identity

- **WHEN** 후속 capability가 이미지형 custom emoji를 추가한다
- **THEN** 시스템은 기존 `reaction_type.id` identity 경계를 재사용한다
- **AND** custom emoji metadata와 lifecycle을 `reaction` 행에 직접 추가하지 않는다

### Requirement: Reaction 관계와 무결성 저장

시스템은 Reaction을 UUIDv7 identity, Author Profile, Target Post, Reaction Type과 생성 시각을 가진 독립 행으로 저장해야 한다(MUST).

#### Scenario: Reaction 행 저장

- **WHEN** 새 Reaction을 저장한다
- **THEN** `reaction.id`는 PostgreSQL `uuid`와 `uuidv7()` default를 사용한다
- **AND** `profile_id`, `post_id`, `reaction_type_id`는 각각 기존 `profile`, `post`, `reaction_type` 행을 참조하는 non-null foreign key다
- **AND** `created_at`은 non-null 생성 시각으로 기록된다

#### Scenario: 존재하지 않는 관계 거부

- **WHEN** 존재하지 않는 Profile, Post 또는 Reaction Type identity로 Reaction을 직접 저장하려 한다
- **THEN** database foreign key는 insert를 거부한다

#### Scenario: Profile 또는 Post 물리 삭제

- **WHEN** Reaction이 참조하는 Profile 또는 Post 행이 물리적으로 삭제된다
- **THEN** 대응하는 Reaction 행도 cascade로 삭제되어 orphan이 남지 않는다

#### Scenario: 사용 중인 Reaction Type 삭제

- **WHEN** 현재 Reaction이 참조하는 Reaction Type 행을 물리적으로 삭제하려 한다
- **THEN** database는 삭제를 거부한다
- **AND** 기존 Reaction identity와 표시 의미를 유지한다

### Requirement: Reaction 유일성과 조회 index

database는 `(post_id, reaction_type_id, profile_id)` 조합의 Reaction을 하나로 제한해야 하며(MUST), Post별 Type count·Type별 Profile 목록과 Profile cleanup 경로에 필요한 index를 제공해야 한다(MUST).

#### Scenario: 중복 조합 거부

- **WHEN** 같은 `post_id`, `reaction_type_id`, `profile_id` 조합을 두 번 insert한다
- **THEN** database unique constraint는 두 번째 insert를 거부한다

#### Scenario: 다른 Type 공존

- **WHEN** 같은 `post_id`와 `profile_id`에 서로 다른 `reaction_type_id`를 insert한다
- **THEN** database는 각 Reaction 행을 허용한다

#### Scenario: 조회와 cleanup index

- **WHEN** migration이 Reaction schema를 생성한다
- **THEN** unique index는 `post_id`, `reaction_type_id`, `profile_id` 순서로 생성된다
- **AND** Profile 물리 삭제와 Profile 기준 cleanup을 위해 `profile_id` index를 생성한다
- **AND** 아직 확정되지 않은 Reaction Profile 표시 순서를 위한 별도 ordering index를 선제 추가하지 않는다

### Requirement: additive Reaction migration

Reaction 저장 schema는 기존 도메인 행을 재작성하지 않는 additive migration으로 전달되어야 한다(MUST).

#### Scenario: 기존 database에 migration 적용

- **WHEN** 기존 Profile과 Post가 있는 database에 Reaction migration을 적용한다
- **THEN** 시스템은 새 Reaction Type과 Reaction schema 및 built-in seed만 추가한다
- **AND** 기존 Profile, Post 또는 다른 도메인 행을 backfill·삭제·재작성하지 않는다
