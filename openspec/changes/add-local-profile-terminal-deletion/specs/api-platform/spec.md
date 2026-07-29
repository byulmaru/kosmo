## MODIFIED Requirements

### Requirement: GraphQL enum registration

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-532 — API는 GraphQL schema에서 실제 공개 field나 input이 사용하는 core enum만 schema 생성 전에 등록해야 한다(MUST). 저장 구현에만 필요한 Profile lifecycle와 suspension enum은 공개 사용 사례 없이 GraphQL 타입으로 노출하지 않아야 한다(MUST NOT).

#### Scenario: Build enum schema during transition

- **WHEN** legacy `ProfileState` compatibility가 남은 transition GraphQL schema를 생성한다
- **THEN** 시스템은 기존 공개 schema compatibility에 필요한 `ProfileState`를 유지할 수 있다
- **AND** `ProfileLifecycleState`와 `ProfileSuspensionState`를 DB에 존재한다는 이유만으로 추가 등록하지 않는다

#### Scenario: Build enum schema after contract

- **WHEN** PROD-544 contract 뒤 GraphQL schema를 생성한다
- **THEN** 시스템은 실제 API가 노출하는 `AccountState`, `AccountProfileRole`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`를 등록한다
- **AND** 사용되지 않는 legacy `ProfileState`를 등록하지 않는다
- **AND** Profile lifecycle 또는 suspension을 공개하는 별도 승인 계약이 생기기 전에는 새 저장 enum도 등록하지 않는다
