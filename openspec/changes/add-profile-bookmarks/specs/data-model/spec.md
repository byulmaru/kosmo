## ADDED Requirements

### Requirement: Bookmark 영속 모델

시스템은 Bookmark를 UUIDv7 primary key, 필수 Owner Profile 관계, 필수 Target Post 관계와 불변 생성 시각을 가진 별도 PostgreSQL row로 저장해야 한다(MUST). Profile/Post 조합은 데이터베이스 제약으로 유일해야 하며(MUST), Profile별 UUIDv7 ID 내림차순 목록을 지원하는 index를 가져야 한다(MUST).

#### Scenario: Bookmark row를 저장함

- **WHEN** 새 Bookmark가 저장된다
- **THEN** 데이터베이스는 `uuidv7()` default로 UUID primary key를 생성한다
- **AND** Owner Profile ID, Target Post ID와 현재 생성 시각을 필수 값으로 저장한다

#### Scenario: 동일 Profile/Post row를 중복 저장함

- **WHEN** 동일한 Profile ID와 Post ID 조합을 가진 row를 둘 이상 저장하려 한다
- **THEN** 데이터베이스는 유일 제약으로 중복 row를 거부한다

#### Scenario: Profile별 ID-only 목록을 조회함

- **WHEN** 시스템이 한 Profile의 Bookmark를 UUIDv7 ID 내림차순으로 조회한다
- **THEN** 데이터베이스는 Profile과 ID를 포함한 index로 조회를 지원한다

#### Scenario: Target Post 상태가 변경됨

- **WHEN** Target Post가 Tombstone이 되거나 조회 정책상 보이지 않게 된다
- **THEN** 데이터베이스는 Bookmark row와 Target Post 관계를 그대로 유지한다

#### Scenario: Target Post가 물리적으로 삭제됨

- **WHEN** Target Post row가 물리적으로 삭제된다
- **THEN** 데이터베이스는 foreign key cascade로 연결된 Bookmark row를 삭제한다
