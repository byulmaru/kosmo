## MODIFIED Requirements

### Requirement: GraphQL enum registration

API는 GraphQL schema에서 노출되는 core enum을 schema 생성 전에 등록해야 한다(MUST).

#### Scenario: Build enum schema

- **WHEN** GraphQL schema가 생성된다
- **THEN** 시스템은 현재 API가 노출하는 core enum을 GraphQL enum으로 등록한다
- **AND** 현재 등록 대상은 `AccountState`, `AccountProfileRole`, `InstanceKind`, `NotificationType`, `PostState`, `PostVisibility`, `ProfileFollowPolicy`, `ProfileState`이다
