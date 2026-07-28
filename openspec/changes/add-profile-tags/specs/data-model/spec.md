## ADDED Requirements

### Requirement: Profile Tag 관계 저장

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-522`, `PROD-526` — 시스템은 정규화된 Hashtag Name마다 하나의 Hashtag row를 저장하고(MUST), Profile과 Hashtag 사이의 순서 있는 다대다 Profile Tag 관계를 별도 row로 저장해야 한다(MUST). 같은 Profile은 같은 Hashtag 또는 같은 순서 위치를 중복 참조할 수 없어야 하며(MUST), 저장 제약으로 Profile당 최대 5개의 연속된 순서를 표현할 수 있어야 한다(MUST).

#### Scenario: Store a shared Hashtag identity

- **WHEN** 정규화된 Hashtag Name이 처음 Profile Tag로 저장된다
- **THEN** 시스템은 UUID 기반 identity와 고유한 정규화 이름을 가진 Hashtag row를 만든다
- **AND** 같은 정규화 이름을 다시 저장하면 기존 Hashtag row를 재사용한다

#### Scenario: Store an ordered Profile Tag relation

- **WHEN** Profile이 유효한 Hashtag 목록을 저장한다
- **THEN** 시스템은 Profile ID, Hashtag ID와 0~4 범위의 순서 위치를 필수 값으로 저장한다
- **AND** 같은 Profile/Hashtag 조합과 같은 Profile/순서 위치 조합은 각각 중복될 수 없다

#### Scenario: Add the model without deriving from bio

- **WHEN** migration이 기존 Profile과 Post data가 있는 데이터베이스에 적용된다
- **THEN** 시스템은 기존 row를 변경하지 않는 additive Hashtag·Profile Tag 저장 구조를 추가한다
- **AND** 기존 Profile bio 또는 Post 본문에서 Profile Tag를 backfill하지 않는다
- **AND** 기존 Profile은 빈 Profile Tag 목록으로 호환된다

#### Scenario: Retain relations across unavailable states

- **WHEN** Profile이 비활성화되거나 정지된다
- **THEN** 시스템은 저장된 Profile Tag 관계와 순서를 삭제하거나 변경하지 않는다

#### Scenario: Cascade only the deleted Profile relations

- **WHEN** Profile row가 물리 삭제된다
- **THEN** 데이터베이스는 해당 Profile의 Profile Tag 관계를 함께 삭제한다
- **AND** Hashtag row와 다른 Post 또는 Profile의 Hashtag 관계는 유지한다
