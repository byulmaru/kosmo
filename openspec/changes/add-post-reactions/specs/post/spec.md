## ADDED Requirements

### Requirement: Post Reaction 조회

API는 조회 가능한 Post에 현재 Reaction Type별 count와 Type별 Reaction Profile connection을 제공해야 한다(MUST).

#### Scenario: Post Reaction summary 조회

- **WHEN** viewer가 조회할 수 있는 Post의 Reaction summary를 요청한다
- **THEN** Post object는 현재 Reaction Type과 count를 count 내림차순으로 제공한다
- **AND** count는 Post를 조회할 수 있는 viewer 사이에서 같다
- **AND** count가 같은 Type 사이의 순서는 보장하지 않는다

#### Scenario: Post Reaction Profile 조회

- **WHEN** viewer가 조회할 수 있는 Post에서 한 Reaction Type의 Profile connection을 요청한다
- **THEN** Post object는 해당 Type에 Reaction을 남겼고 viewer가 조회할 수 있는 Profile만 반환한다
- **AND** connection은 cursor pagination을 지원한다

#### Scenario: Post 조회 정책 재사용

- **WHEN** viewer가 대상 Post를 GraphQL Post object로 조회할 수 없다
- **THEN** API는 그 Post의 Reaction summary와 Profile connection도 노출하지 않는다
