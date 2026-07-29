## ADDED Requirements

### Requirement: Profile Tag 관계 저장

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — Hashtag가 소유하는 canonical Name identity마다 하나의 Hashtag row를 저장하고(MUST), Profile과 Hashtag 사이의 Profile Tag 관계를 별도 row로 저장해야 한다(MUST). 같은 Profile은 같은 Hashtag identity를 중복 참조할 수 없어야 하며 `(profile_id, hashtag_id)` 유일성으로 보장해야 한다(MUST). 관계 row에는 position column·순서 제약·제품 max count를 두지 않는다.

#### Scenario: Store a canonical Hashtag identity

- **WHEN** 정규화된 Hashtag Name이 처음 Profile Tag로 저장된다
- **THEN** 시스템은 UUID 기반 identity와 고유한 정규화 이름을 가진 Hashtag row를 만든다
- **AND** 같은 정규화 이름을 다시 저장하면 동일한 canonical Hashtag identity를 나타내는 row를 재사용한다

#### Scenario: Store a Profile Tag identity relation

- **WHEN** Profile이 유효한 Hashtag identity 목록을 저장한다
- **THEN** 시스템은 Profile ID와 Hashtag ID를 Profile Tag 관계 row의 필수 값으로 저장한다
- **AND** 같은 Profile/Hashtag 조합은 중복될 수 없다
- **AND** 관계 저장·조회와 API 배열은 특정 순서를 보장하지 않는다

#### Scenario: Add the model without deriving from bio

- **WHEN** migration이 기존 Profile과 Post data가 있는 데이터베이스에 적용된다
- **THEN** 시스템은 기존 Profile·Post row를 변경하지 않는 additive Hashtag·Profile Tag 저장 구조를 추가한다
- **AND** 기존 Profile bio 또는 Post 본문에서 Profile Tag를 backfill하지 않는다
- **AND** 기존 Profile은 빈 Profile Tag 목록으로 호환된다

#### Scenario: Retain relations across unavailable states

- **WHEN** Profile이 비활성화되거나 정지된다
- **THEN** 시스템은 저장된 Profile Tag 관계를 삭제하거나 변경하지 않는다

### Requirement: Profile Tag 관계 보존과 물리 삭제 safety

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-522`, `PROD-526` — Profile Lifecycle State가 `Deleted`로 전이됐다는 사실만으로 `profile_hashtag` 관계를 제거해서는 안 된다(MUST NOT). Profile row가 물리 삭제되면 FK cascade로 해당 Profile 관계만 제거해야 하며(MUST), canonical Hashtag row와 다른 Post 또는 Profile의 관계를 삭제해서는 안 된다(MUST NOT).

#### Scenario: Retain relations on Deleted lifecycle transition

- **WHEN** Profile Lifecycle State가 `Deleted`로 전이하고 Profile row가 유지된다
- **THEN** 시스템은 해당 Profile의 `profile_hashtag` 관계를 상태 전이만으로 제거하지 않는다
- **AND** 공개 조회 정책은 Deleted Profile과 그 Tag를 노출하지 않는다

#### Scenario: Cascade only the deleted Profile relations on physical row deletion

- **WHEN** Profile row가 물리 삭제된다
- **THEN** 데이터베이스는 해당 Profile의 Profile Tag 관계를 함께 삭제한다
- **AND** Hashtag row와 다른 Post 또는 Profile의 Hashtag 관계는 유지한다
