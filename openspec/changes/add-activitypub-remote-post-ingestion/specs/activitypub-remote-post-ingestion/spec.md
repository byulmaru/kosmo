## ADDED Requirements

### Requirement: Fedify inbox Note ingestion boundary

시스템은 inbox로 전달되는 remote Note activity 처리에서 Fedify가 제공하는 inbox, signature, key, vocabulary 기능을 재사용해야 한다(MUST).

#### Scenario: Use Fedify for inbound Note delivery

- **WHEN** remote actor가 local actor inbox 또는 shared inbox로 `Create(Note)` activity를 보낸다
- **THEN** Fedify inbox listener는 verified typed `Create(Note)` activity를 kosmo post materialization handler에 전달한다
- **AND** 시스템은 request parsing, HTTP signature verification, remote actor key verification, typed ActivityPub object parsing을 직접 구현하지 않는다

### Requirement: Remote inbox Note ingestion

시스템은 inbox로 전달된 public top-level ActivityPub Note를 kosmo `Post`로 materialize해야 한다(MUST).

#### Scenario: Materialize public inbound remote notes

- **WHEN** Fedify inbox listener가 verified remote `Create(Note)` activity를 전달한다
- **THEN** 시스템은 activity actor를 저장된 ActivityPub remote `Profile`로 조회한다
- **AND** 저장된 ActivityPub remote `Profile`로 조회되지 않는 actor의 delivery는 skip하며, 이번 capability에서 WebFinger lookup이나 actor materialization을 수행하지 않는다
- **AND** `Create.actor`가 있으면 materialized remote actor URI와 일치해야 한다
- **AND** Note `attributedTo`는 materialized remote actor URI와 일치해야 한다
- **AND** 시스템은 `to`에 `as:Public`이 있거나 `cc`에만 `as:Public`이 있으며 `inReplyTo`가 없는 top-level Note를 찾는다
- **AND** `to`에 `as:Public`이 있으면 `Post.visibility`를 `PUBLIC`으로 저장한다
- **AND** `to`에는 `as:Public`이 없고 `cc`에만 `as:Public`이 있으면 `Post.visibility`를 `UNLISTED`로 저장한다
- **AND** 시스템은 각 Note의 ActivityPub object URI를 unique identity로 저장한다
- **AND** 시스템은 중복 object URI가 기존 object mapping의 작성 actor와 같은 remote actor에서 재전달된 경우 새 `Post`를 만들지 않고 기존 `Post`, `PostContent`, ActivityPub object mapping projection을 갱신한다
- **AND** 시스템은 materialized remote posts를 `Profile.posts` connection에서 반환할 수 있게 한다
- **AND** 시스템은 remote actor outbox를 조회하지 않는다

#### Scenario: Materialize public shared inbox Create Note

- **WHEN** Fedify shared inbox listener가 verified remote `Create(Note)` activity를 전달한다
- **THEN** 시스템은 local follow 관계, personal inbox recipient, 또는 local recipient 검증을 요구하지 않는다
- **AND** 저장된 ActivityPub remote profile 조회, actor attribution, public top-level Note 검증이 통과하면 해당 Note를 `Post`로 materialize한다

#### Scenario: Skip non-public or unsupported remote objects

- **WHEN** inbound object가 public top-level Note로 판정되지 않거나 Note가 아닌 ActivityPub object이다
- **THEN** 시스템은 해당 object를 `Post`로 materialize하지 않는다
- **AND** followers-only, private, direct addressing은 이번 capability에서 materialize하지 않는다
- **AND** 시스템은 reply/thread, update, delete, announce, like 처리를 후속 변경으로 남긴다

#### Scenario: Skip Note with mismatched attribution

- **WHEN** inbound `Create(Note)`의 activity actor, Note `attributedTo`, materialized remote actor URI가 서로 일치하지 않는다
- **THEN** 시스템은 해당 Note를 `Post`로 materialize하지 않는다
- **AND** 기존 materialized `Post` 또는 ActivityPub object mapping을 갱신하지 않는다

#### Scenario: Skip duplicate Note URI from different actor

- **WHEN** inbound `Create(Note)`의 Note object URI가 이미 ActivityPub object mapping에 저장되어 있다
- **AND** 기존 object mapping의 작성 actor가 이번 delivery의 materialized remote actor URI와 다르다
- **THEN** 시스템은 해당 Note를 새 `Post`로 materialize하지 않는다
- **AND** 기존 `Post`, `PostContent`, ActivityPub object mapping을 갱신하지 않는다

#### Scenario: Guard inbound Note from blocked instance

- **WHEN** Fedify inbox listener가 verified remote Note delivery를 전달하고 remote actor가 저장된 ActivityPub remote `Profile`로 조회된다
- **THEN** 시스템은 remote actor의 instance 상태를 확인한다
- **AND** remote actor instance가 `SUSPENDED`이면 `Post`, `PostContent`, ActivityPub object mapping을 생성하거나 갱신하지 않는다
- **AND** remote actor instance가 `UNRESPONSIVE`인 경우에도 저장된 active remote profile과 actor/object attribution 검증이 통과하면 Note를 materialize할 수 있다

#### Scenario: Skip Note from unknown actor

- **WHEN** inbound `Create(Note)`의 activity actor가 저장된 ActivityPub remote `Profile`로 조회되지 않는다
- **THEN** 시스템은 해당 Note를 `Post`로 materialize하지 않는다
- **AND** 시스템은 추가 WebFinger discovery 또는 actor profile materialization을 시도하지 않는다
- **AND** 이 조건은 Fedify가 inbox verification 과정에서 수행하는 actor key verification 또는 typed object handling을 금지하지 않는다

#### Scenario: Project remote Note content

- **WHEN** 시스템이 remote Note를 `Post`로 materialize한다
- **THEN** 시스템은 Note 작성자를 remote profile로 저장한다
- **AND** Note `published`가 있으면 시스템은 해당 시각을 `Post.createdAt`으로 저장한다
- **AND** Note `published`가 있으면 시스템은 ActivityPub object mapping의 원본 published 시각으로도 저장한다
- **AND** 새 remote post 최초 저장 시 Note `published`가 없으면 시스템은 수신 시각을 `Post.createdAt` fallback으로 사용한다
- **AND** 새 remote post 최초 저장 시 Note `published`가 없으면 시스템은 ActivityPub object mapping의 원본 published 시각을 `null`로 저장한다
- **AND** 기존 object URI가 재전달됐고 Note `published`가 없으면 시스템은 기존 `Post.createdAt`을 유지한다
- **AND** 시스템은 Note HTML content를 `PostContent.bodyHtml`로 저장할 수 있다
- **AND** 시스템은 Note content에서 plain text projection을 만들어 `PostContent.bodyText`로 저장한다
- **AND** 시스템은 plain text projection에서 단순 TipTap document를 만들어 `PostContent.bodyJson`으로 저장한다

#### Scenario: Return only materialized posts

- **WHEN** remote profile의 posts materialization이 없거나 저장된 materialized posts만 있다
- **THEN** 시스템은 GraphQL `Profile.posts` 요청 중 remote actor outbox refresh를 시도하지 않는다
- **AND** 시스템은 이미 materialized된 remote posts만 반환한다
- **AND** 저장된 materialized posts가 없으면 빈 connection을 반환한다
