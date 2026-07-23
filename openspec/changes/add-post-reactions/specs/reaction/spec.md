## ADDED Requirements

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

Active Account의 Member인 Active/Normal Local Profile은 조회할 수 있는 Post에 허용 Reaction Type을 추가할 수 있어야 하며(MUST), 같은 조합의 반복·동시 추가는 기존 Reaction을 유지한 성공 결과여야 한다(MUST).

GraphQL `usingProfile` entry point는 Active Account와 Account–Profile membership을 검증해야 하며(MUST), core service는 검증된 actor Profile identity를 받아 Active/Normal Local Profile, Post, Type과 멱등 저장을 검증해야 한다(MUST).

GraphQL API는 `addReaction` mutation의 input으로 `postId: ID!`와 `type: String!`을 받아야 하며(MUST), 성공 payload는 `reaction: Reaction!`을 반환해야 한다(MUST). 공개 payload는 신규 생성 여부를 노출해서는 안 된다(MUST NOT).

#### Scenario: GraphQL Reaction 추가 계약

- **WHEN** 권한 있는 Profile이 `addReaction`에 Post global ID와 허용 Type 문자열을 전달한다
- **THEN** API는 `AddReactionPayload.reaction`으로 현재 Reaction Node를 반환한다
- **AND** `postId`는 concrete `Post` global ID만 허용한다
- **AND** payload는 `created` 또는 동등한 신규 생성 여부를 노출하지 않는다

#### Scenario: 새 Reaction 추가

- **WHEN** 권한 있는 Local Profile이 조회 가능한 Post에 아직 없는 허용 Reaction Type을 추가한다
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

### Requirement: Owner의 멱등 Reaction 삭제

**Authority / Provenance:** [Reaction canonical 객체](../../../../../docs/domain/objects/reaction.md), [ADR 0012](../../../../../docs/domain/decisions/0012-post-interaction-followup-clarifications.md), [PROD-405](https://linear.app/byulmaru/issue/PROD-405/reaction을-삭제한다) — Reaction Owner는 대상 Post의 현재 조회 가능성과 무관하게 자신의 Reaction을 삭제할 수 있어야 하며(MUST), 자신이 이미 제거한 동일 Reaction의 반복·동시 삭제는 상태를 바꾸지 않는 성공 결과여야 한다(MUST).

GraphQL API는 `deleteReaction` mutation의 input으로 `id: ID!`를 받아야 하며(MUST), 성공 payload는 `reactionId: ID!`를 반환해야 한다(MUST). input과 payload의 ID는 concrete `Reaction` global ID여야 하며(MUST), payload는 실제 삭제 여부를 노출해서는 안 된다(MUST NOT).

#### Scenario: GraphQL Reaction 삭제 계약

- **WHEN** Profile이 `deleteReaction`에 Reaction global ID를 전달한다
- **THEN** 성공 payload는 `DeleteReactionPayload.reactionId`로 입력과 같은 Reaction global ID를 반환한다
- **AND** 이미 제거된 ID의 성공한 no-op도 같은 ID를 반환한다
- **AND** payload는 `deleted` 또는 동등한 실제 삭제 여부를 노출하지 않는다

#### Scenario: Owner Reaction 삭제

- **WHEN** Reaction Owner가 현재 존재하는 자신의 Reaction을 삭제한다
- **THEN** 시스템은 Reaction을 제거하고 성공 결과를 반환한다

#### Scenario: Post가 더 이상 조회되지 않는 Owner 삭제

- **WHEN** Reaction Owner가 더 이상 조회할 수 없는 Post에 남긴 자신의 Reaction을 삭제한다
- **THEN** 시스템은 기존 소유권을 확인해 Reaction을 제거한다

#### Scenario: 이미 제거한 Reaction 재삭제

- **WHEN** 이미 제거된 Reaction ID의 삭제를 재시도한다
- **THEN** 시스템은 성공한 멱등 no-op을 반환한다
- **AND** 입력과 같은 Reaction global ID를 반환한다

#### Scenario: 제거 뒤 같은 조합을 다시 생성함

- **WHEN** Reaction을 제거한 뒤 같은 Profile/Post/Type 조합에 새 Reaction을 생성하고 이전 Reaction ID의 삭제를 재시도한다
- **THEN** 이전 ID의 삭제는 성공한 no-op을 반환한다
- **AND** 새 Reaction은 제거하지 않는다

#### Scenario: 같은 Reaction 동시 삭제

- **WHEN** 같은 Owner가 같은 Reaction ID의 삭제를 동시에 요청한다
- **THEN** 최종 상태에는 해당 Reaction이 존재하지 않는다
- **AND** 각 요청은 같은 Reaction global ID를 반환하는 성공 결과로 끝난다

#### Scenario: 다른 Profile의 Reaction 삭제

- **WHEN** Profile이 다른 Profile 소유의 현재 Reaction을 삭제하려 한다
- **THEN** GraphQL API는 `PERMISSION_DENIED` 오류로 요청을 거부한다
- **AND** 다른 Profile의 Reaction을 유지한다

### Requirement: viewer와 무관한 Reaction Type count

Post의 Reaction Type별 count는 대상 Post에 현재 존재하는 모든 Reaction을 포함해야 하며(MUST), Post를 조회할 수 있는 viewer 사이에서 같아야 한다(MUST). Type은 count 내림차순으로 제공해야 하며(MUST), 동률 순서는 보장하지 않아야 한다(MUST NOT).

#### Scenario: viewer 간 같은 count

- **WHEN** 서로 다른 viewer가 모두 같은 Post를 조회할 수 있다
- **THEN** 시스템은 두 viewer에게 같은 Type별 count를 반환한다
- **AND** viewer가 조회할 수 없는 Profile의 현재 Reaction도 count에 포함한다

#### Scenario: 삭제 반영

- **WHEN** 현재 Reaction이 삭제된다
- **THEN** 다음 Type별 count는 삭제된 Reaction을 포함하지 않는다

#### Scenario: count 정렬

- **WHEN** 둘 이상의 Reaction Type count가 다르다
- **THEN** 시스템은 count가 큰 Type부터 반환한다
- **AND** count가 같은 Type 사이의 순서는 별도로 보장하지 않는다

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
