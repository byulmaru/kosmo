## ADDED Requirements

### Requirement: Post Reaction 조회

**Authority / Provenance:** [Reaction canonical 객체](../../../../../../docs/domain/objects/reaction.md), [ADR 0010](../../../../../../docs/domain/decisions/0010-post-interaction-contracts.md), [ADR 0016](../../../../../../docs/domain/decisions/0016-reaction-selector-current-state.md), [PROD-406](https://linear.app/byulmaru/issue/PROD-406), [PROD-407](https://linear.app/byulmaru/issue/PROD-407), [PROD-472](https://linear.app/byulmaru/issue/PROD-472), [PROD-576](https://linear.app/byulmaru/issue/PROD-576) API는 조회 가능한 Post에 현재 Reaction Type별 count, Type별 Reaction Profile connection과 selected Profile의 현재 Reaction 관계를 제공해야 한다(MUST). GraphQL API는 `Post.reactionCounts: [ReactionCount!]!`, `Post.reactionProfiles(type: String!): ProfileConnection!`과 `Post.viewerReactions: [Reaction!]!`를 제공해야 한다(MUST). `ReactionCount`는 `type: String!`과 `count: Int!`만 제공해야 한다(MUST).

#### Scenario: Post Reaction summary 조회

- **WHEN** viewer가 조회할 수 있는 Post의 Reaction summary를 요청한다
- **THEN** `Post.reactionCounts`는 현재 Reaction이 하나 이상 존재하는 Type과 count를 `ReactionCount` 목록으로 제공한다
- **AND** 목록은 각 Type에 현재 존재하는 Reaction의 최초 생성 시각 오름차순이다
- **AND** count는 Post를 조회할 수 있는 viewer 사이에서 같다
- **AND** 최초 생성 시각이 같은 Type에는 제품상 우선순위가 아닌 결정적 최종 순서를 적용한다
- **AND** 한 Type의 현재 Reaction이 모두 제거됐다가 다시 생성되면 새 현재 최초 생성 시각으로 순서를 정한다

#### Scenario: Reaction이 없는 Post summary 조회

- **WHEN** viewer가 현재 Reaction이 없는 조회 가능한 Post의 Reaction summary를 요청한다
- **THEN** `Post.reactionCounts`는 빈 목록을 반환한다

#### Scenario: Post Reaction Profile 조회

- **WHEN** viewer가 조회할 수 있는 Post에서 한 Reaction Type의 Profile connection을 요청한다
- **THEN** Post object는 해당 Type에 Reaction을 남겼고 viewer가 조회할 수 있는 Profile만 반환한다
- **AND** GraphQL field는 `reactionProfiles(type: String!): ProfileConnection!` 계약을 사용한다
- **AND** connection은 cursor pagination을 지원한다

#### Scenario: selected Profile의 Post Reaction 조회

- **WHEN** viewer가 조회 가능한 Post의 `viewerReactions`를 요청한다
- **THEN** Post object는 현재 selected Profile이 남긴 Reaction Node만 반환한다
- **AND** guest 또는 selected Profile이 없는 viewer에게 빈 목록을 반환한다
- **AND** 여러 Post를 함께 조회할 때 Post별 추가 query를 발생시키지 않는다

#### Scenario: Post 조회 정책 재사용

- **WHEN** viewer가 대상 Post를 GraphQL Post object로 조회할 수 없다
- **THEN** API는 그 Post의 Reaction summary, Profile connection과 selected Profile Reaction 목록도 노출하지 않는다
