# reaction Specification

## Purpose

TBD - created by archiving change add-post-reactions. Update Purpose after archive.

## Requirements

### Requirement: 초기 Reaction Type 계약

시스템은 현재 Reaction Type으로 `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈`의 정확한 Unicode 표현만 허용해야 한다(MUST).

#### Scenario: 허용된 built-in Type

- **WHEN** Profile이 허용된 여섯 Reaction Type 중 하나로 Reaction을 추가한다
- **THEN** 시스템은 입력의 정확한 Unicode 문자열을 Reaction Type으로 사용한다

#### Scenario: 허용되지 않은 Type

- **WHEN** Profile이 임의 Unicode, variation selector가 다른 값 또는 사용자 정의 Reaction을 추가한다
- **THEN** 시스템은 요청을 validation 오류로 거부한다
- **AND** Reaction을 저장하지 않는다

### Requirement: Reaction GraphQL Node 계약

API는 Reaction을 opaque global ID, 현재 Type 문자열과 생성 시각을 제공하는 Relay Node로 노출해야 한다(MUST). Reaction Node 조회는 대상 Post의 기존 조회 정책을 그대로 적용해야 한다(MUST).

#### Scenario: Reaction Node 노출

- **WHEN** viewer가 조회할 수 있는 Post의 Reaction Node를 조회한다
- **THEN** API는 `id`, `type`, `createdAt`을 제공한다
- **AND** `id`는 concrete `Reaction` typename과 database UUID를 포함한 opaque global ID다
- **AND** `type`은 저장된 정확한 Unicode 문자열이다

#### Scenario: 조회할 수 없는 Reaction Node

- **WHEN** viewer가 대상 Post를 조회할 수 없는 Reaction global ID를 조회한다
- **THEN** Node 조회는 `null`을 반환한다
- **AND** API는 Reaction 또는 Post의 존재 여부를 추가로 노출하지 않는다

### Requirement: Reaction 유일성과 공존

시스템은 같은 Profile/Post/Reaction Type 조합에 Reaction을 하나만 유지해야 하며(MUST), 같은 Profile과 Post에 서로 다른 Reaction Type이 함께 존재하는 것을 허용해야 한다(MUST).

#### Scenario: 같은 Type 중복 저장

- **WHEN** 같은 Profile/Post/Reaction Type 조합을 둘 이상 저장하려 한다
- **THEN** database 유일성 경계는 두 번째 Reaction 생성을 허용하지 않는다

#### Scenario: 다른 Type 공존

- **WHEN** 같은 Profile이 같은 Post에 서로 다른 허용 Reaction Type을 추가한다
- **THEN** 시스템은 Type마다 Reaction을 하나씩 유지한다

### Requirement: 멱등 Reaction 추가

**Authority / Provenance:** [Reaction canonical 객체](../../../../../docs/domain/objects/reaction.md), [ADR 0019](../../../../../docs/domain/decisions/0019-selected-profile-authorization-boundary.md), [PROD-404](https://linear.app/byulmaru/issue/PROD-404/reaction을-생성한다), [PROD-439](https://linear.app/byulmaru/issue/PROD-439/kosmo에서-uploading-local-media를-생성한다) — Active Account의 Member인 Active/Normal Profile은 조회할 수 있는 Post에 허용 Reaction Type을 추가할 수 있어야 하며(MUST), 같은 조합의 반복·동시 추가는 기존 Reaction을 유지한 성공 결과여야 한다(MUST). 선택 Profile의 Instance Type은 Reaction 추가 권한 조건이어서는 안 된다(MUST NOT).

GraphQL `usingProfile` entry point는 Active Account, Account–Profile membership과 selected Profile의 Active/Normal 및 non-Suspended Instance 조회 가능 상태를 검증해야 하며(MUST), resolver와 core service는 Account, membership, Profile/Instance 상태와 Instance Type을 중복 조회·검증해서는 안 된다(MUST NOT). core service는 검증된 actor Profile identity를 받아 Post, Type과 멱등 저장만 검증해야 한다(MUST).

GraphQL API는 `addReaction` mutation의 input으로 `postId: ID!`와 `type: String!`을 받아야 하며(MUST), 성공 payload는 `reaction: Reaction!`과 현재 조회 가능한 `post: Post!`를 반환해야 한다(MUST). 공개 payload는 신규 생성 여부를 노출해서는 안 된다(MUST NOT).

#### Scenario: GraphQL Reaction 추가 계약

- **WHEN** 권한 있는 Profile이 `addReaction`에 Post global ID와 허용 Type 문자열을 전달한다
- **THEN** API는 `AddReactionPayload.reaction`으로 현재 Reaction Node를 반환한다
- **AND** payload의 `post`에서 갱신된 `viewerReactions`와 `reactionCounts`를 조회할 수 있다
- **AND** `postId`는 concrete `Post` global ID만 허용한다
- **AND** payload는 `created` 또는 동등한 신규 생성 여부를 노출하지 않는다

#### Scenario: 새 Reaction 추가

- **WHEN** 권한 있는 Profile이 조회 가능한 Post에 아직 없는 허용 Reaction Type을 추가한다
- **THEN** 시스템은 Profile, Post와 Reaction Type을 참조하는 Reaction 하나를 생성한다
- **AND** 생성된 Reaction 결과를 반환한다

#### Scenario: 같은 Reaction 반복 추가

- **WHEN** 권한 있는 Profile이 이미 존재하는 같은 Post/Type Reaction을 다시 추가한다
- **THEN** 시스템은 기존 Reaction을 유지한 멱등 성공 결과를 반환한다
- **AND** 추가 Reaction을 생성하지 않는다
- **AND** GraphQL payload는 기존 Reaction과 같은 global ID의 Node를 반환한다

#### Scenario: 같은 Reaction 동시 추가

- **WHEN** 같은 Profile/Post/Type 조합의 추가 요청이 동시에 실행된다
- **THEN** 최종 상태에는 Reaction이 하나만 존재한다
- **AND** 성공한 요청은 동일한 현재 관계를 관찰한다

#### Scenario: 조회할 수 없는 Post

- **WHEN** 행동 주체 Profile이 대상 Post의 조회 정책을 통과하지 못한다
- **THEN** GraphQL API는 `NOT_FOUND` 오류로 요청을 거부한다
- **AND** 존재하지 않는 Post와 조회할 수 없는 Post를 구분하지 않는다
- **AND** Reaction과 Notification을 생성하지 않는다

#### Scenario: 허용되지 않은 GraphQL Type

- **WHEN** `addReaction`의 `type`에 허용 목록 밖 문자열을 전달한다
- **THEN** GraphQL API는 `VALIDATION` 오류를 반환한다
- **AND** 오류의 field는 `type`이다
- **AND** Reaction을 저장하지 않는다

### Requirement: selected Profile의 현재 Reaction 조회

**Authority / Provenance:** [Reaction canonical 객체](../../../../../docs/domain/objects/reaction.md), [ADR 0016](../../../../../docs/domain/decisions/0016-reaction-selector-current-state.md), [PROD-472](https://linear.app/byulmaru/issue/PROD-472/reaction-selector%EC%9A%A9-%ED%98%84%EC%9E%AC-%EC%83%81%ED%83%9C-%EC%A1%B0%ED%9A%8C%EC%99%80-type-%EC%82%AD%EC%A0%9C-%EA%B3%84%EC%95%BD%EC%9D%84-%EB%B3%B4%EC%99%84%ED%95%9C%EB%8B%A4) — Post를 조회하는 viewer는 현재 selected Profile이 남긴 Reaction 관계를 복원할 수 있어야 한다(MUST). GraphQL API는 `Post.viewerReactions: [Reaction!]!`를 제공해야 하며(MUST), guest 또는 selected Profile이 없는 viewer에게 빈 목록을 반환해야 한다(MUST).

#### Scenario: selected Profile의 현재 관계

- **WHEN** selected Profile이 조회 가능한 Post에 여러 Reaction Type을 남겼다
- **THEN** `Post.viewerReactions`는 해당 Profile의 현재 Reaction Node를 모두 반환한다
- **AND** 각 Node의 ID와 Type을 제공한다
- **AND** 다른 Profile의 Reaction은 포함하지 않는다

#### Scenario: guest와 selected Profile 부재

- **WHEN** guest 또는 selected Profile이 없는 Account가 조회 가능한 Post를 요청한다
- **THEN** `Post.viewerReactions`는 빈 목록이다

#### Scenario: Profile 전환과 여러 Post 조회

- **WHEN** selected Profile을 전환하거나 한 요청에서 여러 Post의 `viewerReactions`를 조회한다
- **THEN** 각 결과는 현재 selected Profile과 Post 조합에 상대적이다
- **AND** 이전 Profile의 결과를 재사용하지 않는다
- **AND** Post별 추가 query를 발생시키지 않는다

### Requirement: Post와 Type 기준의 멱등 Reaction 삭제

**Authority / Provenance:** [Reaction canonical 객체](../../../../../docs/domain/objects/reaction.md), [ADR 0016](../../../../../docs/domain/decisions/0016-reaction-selector-current-state.md), [PROD-472](https://linear.app/byulmaru/issue/PROD-472/reaction-selector%EC%9A%A9-%ED%98%84%EC%9E%AC-%EC%83%81%ED%83%9C-%EC%A1%B0%ED%9A%8C%EC%99%80-type-%EC%82%AD%EC%A0%9C-%EA%B3%84%EC%95%BD%EC%9D%84-%EB%B3%B4%EC%99%84%ED%95%9C%EB%8B%A4) — selected Profile은 대상 Post의 현재 조회 가능성과 무관하게 Post와 Reaction Type으로 자신의 현재 Reaction을 삭제할 수 있어야 하며(MUST), 관계가 없는 반복·동시 삭제는 상태를 바꾸지 않는 성공 결과여야 한다(MUST).

GraphQL API는 `deleteReaction` mutation의 input으로 `postId: ID!`와 `type: String!`을 받아야 한다(MUST). 성공 payload는 실제 삭제된 concrete Reaction global ID인 nullable `reactionId`와 현재 조회 가능한 nullable `post`를 반환해야 한다(MUST). missing·반복·동시 loser는 `reactionId: null`인 성공이어야 하며(MUST), payload는 별도 `deleted` boolean을 노출해서는 안 된다(MUST NOT).

GraphQL `usingProfile` entry point는 actor의 Active/Normal Profile과 non-Suspended Instance 상태를 검증해야 하며(MUST), core service는 검증된 actor identity의 Profile/Instance 상태, Instance Type이나 Unresponsive Reachability를 다시 조회·검증해서는 안 된다(MUST NOT). 실제 삭제된 Reaction ID가 있을 때만 source transaction commit 뒤 Notification cleanup을 Best Effort로 시도해야 한다(MUST).

#### Scenario: 현재 Reaction 삭제

- **WHEN** selected Profile이 자신의 현재 Reaction과 같은 Post와 Type을 전달한다
- **THEN** 시스템은 해당 Reaction만 제거한다
- **AND** payload의 `reactionId`는 삭제된 Reaction global ID이다
- **AND** Target Post가 현재 조회 가능하면 payload의 `post`에서 갱신된 `viewerReactions`와 `reactionCounts`를 조회할 수 있다

#### Scenario: 관계가 없는 반복 삭제

- **WHEN** selected Profile이 현재 관계가 없는 Post와 Type의 삭제를 요청한다
- **THEN** mutation은 `reactionId: null`인 성공을 반환한다
- **AND** Target Post가 현재 조회 가능하면 payload의 `post`는 현재 `viewerReactions`와 `reactionCounts`를 제공한다
- **AND** 다른 Profile과 다른 Type의 Reaction을 변경하지 않는다

#### Scenario: Post가 더 이상 조회되지 않는 삭제

- **WHEN** selected Profile이 더 이상 조회할 수 없는 Post에 남긴 자신의 Reaction을 삭제한다
- **THEN** 시스템은 현재 Profile/Post/Type 관계를 제거한다
- **AND** payload의 `post`는 `null`이다

#### Scenario: 같은 조합의 동시 삭제

- **WHEN** 같은 selected Profile이 같은 Post와 Type의 삭제를 동시에 요청한다
- **THEN** 최종 상태에는 해당 Reaction이 존재하지 않는다
- **AND** 하나의 성공 결과만 삭제된 `reactionId`를 반환하고 나머지는 `reactionId: null`을 반환한다

#### Scenario: 삭제 뒤 같은 조합을 다시 생성함

- **WHEN** Reaction을 제거한 뒤 같은 Profile/Post/Type 조합을 다시 생성하고 오래된 Post/Type 삭제 요청이 도착한다
- **THEN** 현재 재생성된 Reaction이 제거될 수 있다
- **AND** 시스템은 이 경우를 막기 위한 Reaction history나 idempotency ledger를 요구하지 않는다

### Requirement: viewer와 무관한 Reaction Type count

**Authority / Provenance:** [Reaction canonical 객체](../../../../../docs/domain/objects/reaction.md), [ADR 0010](../../../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-406](https://linear.app/byulmaru/issue/PROD-406/reaction-type%EB%B3%84-%EA%B0%9C%EC%88%98%EB%A5%BC-%EC%A1%B0%ED%9A%8C%ED%95%9C%EB%8B%A4), [PROD-576](https://linear.app/byulmaru/issue/PROD-576/reaction-type%EC%9D%84-%EC%B5%9C%EC%B4%88-reaction-%EC%83%9D%EC%84%B1-%EC%8B%9C%EA%B0%81-%EC%88%9C%EC%9C%BC%EB%A1%9C-%EC%95%88%EC%A0%95%EC%A0%81%EC%9C%BC%EB%A1%9C-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4) Post의 Reaction Type별 count는 대상 Post에 현재 존재하는 모든 Reaction을 포함해야 하며(MUST), Post를 조회할 수 있는 viewer 사이에서 같아야 한다(MUST). Type은 각 Type에 현재 존재하는 Reaction의 최초 생성 시각 오름차순으로 제공해야 하며(MUST), 같은 최초 생성 시각에는 결정적 최종 순서를 적용해야 한다(MUST).

#### Scenario: viewer 간 같은 count

- **WHEN** 서로 다른 viewer가 모두 같은 Post를 조회할 수 있다
- **THEN** 시스템은 두 viewer에게 같은 Type별 count를 반환한다
- **AND** viewer가 조회할 수 없는 Profile의 현재 Reaction도 count에 포함한다

#### Scenario: 삭제 반영

- **WHEN** 현재 Reaction이 삭제된다
- **THEN** 다음 Type별 count는 삭제된 Reaction을 포함하지 않는다

#### Scenario: 현재 최초 Reaction 생성 시각 정렬

- **WHEN** 둘 이상의 Reaction Type이 현재 존재한다
- **THEN** 시스템은 각 Type에 현재 존재하는 Reaction의 최초 생성 시각이 이른 Type부터 반환한다
- **AND** 같은 최초 생성 시각에는 제품상 Type 우선순위가 아닌 결정적 최종 순서를 적용한다
- **AND** count 증감만으로 기존 Type의 최초 생성 시각이 바뀌지 않으면 순서를 바꾸지 않는다

#### Scenario: Type 제거와 재등장

- **WHEN** 한 Type의 현재 Reaction이 모두 제거됐다가 나중에 다시 생성된다
- **THEN** 시스템은 새로 존재하는 Reaction의 최초 생성 시각으로 해당 Type의 순서를 정한다

### Requirement: viewer별 Reaction Profile 목록

시스템은 Post와 Reaction Type별로 Reaction을 남긴 Profile의 Relay connection을 제공해야 하며(MUST), 대상 Post와 Profile의 기존 조회 정책을 각각 적용해야 한다(MUST). GraphQL API는 `Post.reactionProfiles(type: String!): ProfileConnection!` field로 이 목록을 제공하고 canonical Reaction Type 문자열 검증을 적용해야 한다(MUST).

#### Scenario: 조회 가능한 Profile만 반환

- **WHEN** viewer가 Post의 한 Reaction Type에 대한 Profile 목록을 조회한다
- **THEN** 시스템은 현재 viewer가 조회할 수 있는 Profile만 반환한다
- **AND** 다른 Reaction Type의 Profile을 섞지 않는다

#### Scenario: Profile connection node 범위

- **WHEN** viewer가 Reaction Profile connection의 node를 조회한다
- **THEN** 시스템은 기존 Profile 객체를 반환한다
- **AND** Reaction 객체, Reaction ID 또는 Reaction 생성 시각을 공개 row field로 노출하지 않는다
- **AND** Reaction 생성 시각과 ID는 최신순 pagination의 opaque cursor 경계에만 사용한다

#### Scenario: Profile pagination

- **WHEN** viewer가 Reaction Profile connection을 여러 page로 조회한다
- **THEN** 시스템은 Reaction 생성 시각 내림차순으로 Profile을 반환한다
- **AND** 생성 시각이 같으면 Reaction ID 내림차순으로 안정적인 순서를 결정한다
- **AND** cursor는 생성 시각과 Reaction ID 경계를 opaque하게 표현한다
- **AND** 시스템은 같은 Profile을 중복 반환하지 않는 안정적인 cursor pagination을 제공한다
- **AND** 숨겨진 Profile 때문에 visible item이 page 경계에서 누락되지 않게 filtering 후 page limit을 적용한다

#### Scenario: 조회할 수 없는 Post의 Reaction 조회

- **WHEN** viewer가 조회할 수 없는 Post의 Reaction count 또는 Profile 목록을 요청한다
- **THEN** 시스템은 Post의 기존 조회 정책과 같은 방식으로 결과를 노출하지 않는다
