# activitypub-remote-followers-post-ingestion Specification

## Purpose

검증된 remote actor의 canonical followers audience와 Active local follower 관계를 근거로 외부 Followers Only Note를 기존 Post/PostContent 및 GraphQL visibility·authorization 계약에 따라 수신·materialize하기 위한 요구사항을 정의한다.

## Requirements

### Requirement: Verified Followers audience and local relevance

**Authority / Provenance:** `docs/domain/objects/post.md#activitypub-local-note-표현`, `docs/domain/objects/follow-relationship.md#조회-정책`, `docs/domain/policies/post-list.md#후보-정책`, `PROD-360`. 시스템은 verified remote actor의 canonical followers collection과 Active local Profile·Active local Instance follower의 established Follow Relationship을 함께 확인한 Followers Only inbound Note만 수신 materialization 후보로 인정해야 한다(MUST).

#### Scenario: Personal inbox delivery for an accepted follower

- **WHEN** personal inbox가 verified remote actor의 remote Note를 받고
- **AND** Note에 Public audience가 없으며 verified author의 canonical followers URI와 추가 actor URI(mention addressee)가 audience에 포함되고
- **AND** local follower Profile이 Active이고 Active local Instance에 연결되어 있으며 remote followee Profile과의 현재 established Follow Relationship이 존재한다
- **THEN** 시스템은 해당 local follower의 수신 관련성을 확인하고, 이 capability의 Followers Only Post materialization 대상으로 판정된 경우에만 materialization을 계속한다
- **AND** 추가 actor URI는 수신 관련성·visibility를 바꾸거나 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 만들지 않는다

#### Scenario: Shared inbox delivery for an accepted follower

- **WHEN** shared inbox가 verified remote actor의 remote Note를 받고
- **AND** Note에 Public audience가 없으며 verified author의 canonical followers URI와 추가 actor URI(mention addressee)가 audience에 포함되고
- **AND** Active local Profile·Active local Instance 중 remote followee를 현재 established Follow Relationship으로 팔로우하는 Profile이 있다
- **THEN** 시스템은 해당 Profile의 수신 관련성을 확인하고, 이 capability의 Followers Only Post materialization 대상으로 판정된 경우에만 materialization을 계속한다
- **AND** shared inbox에 전달됐다는 사실만으로 관계가 없는 Profile을 수신 관련 대상으로 만들지 않는다
- **AND** 추가 actor URI는 수신 관련성·visibility를 바꾸거나 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 만들지 않는다

#### Scenario: Ignore extra audience values after the author marker

- **WHEN** `to`와 `cc` 모두에 Public URI가 없고 verified author의 canonical followers URI가 audience에 있으며
- **AND** audience에 그 URI의 중복 또는 구문상 유효하게 파싱된 foreign/unknown/spoofed-looking followers extra actor/collection URI가 함께 있다
- **THEN** 시스템은 Followers Only로 분류하고 Active local Profile·Active local Instance established Follow Relationship 검사를 계속한다
- **AND** 추가 URI의 개수·순서·형태는 Note 전체를 무효화하지 않는다
- **AND** foreign/unknown URI를 분류하려는 network dereference나 `/followers` 경로 휴리스틱을 수행하지 않는다
- **AND** 추가 URI와 spoofed-looking URI 자체는 follower 권한, Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access의 근거가 아니다
- **AND** raw malformed audience syntax는 기존 vocabulary hydration과 remote Note 기본 검증에서 처리한다

#### Scenario: Actor-only or foreign-followers-only audience is unsupported

- **WHEN** `to`와 `cc`에 Public URI와 verified author의 canonical followers URI가 모두 없고 actor-only DIRECT/limited audience 또는 foreign/unknown followers-looking URI만 있다
- **THEN** 시스템은 Followers Only 분류와 materialization을 만들지 않고 no-op으로 건너뛴다
- **AND** arbitrary URI 문자열, body/tag Mention 또는 delivery route를 follower 권한 근거로 사용하지 않는다
- **AND** foreign/unknown URI를 검증하기 위해 network dereference나 `/followers` 경로 휴리스틱을 수행하지 않는다

#### Scenario: No established local relation

- **WHEN** follower Profile이 Active local Profile이 아니거나 연결된 Instance가 Active local Instance가 아니거나
- **OR** Active local follower Profile과 remote followee 사이에 current established Follow Relationship이 없거나
- **OR** 관계가 pending·rejected Follow Request 상태이거나 unfollow로 제거되었다
- **OR** follower Profile이 inactive이거나 follower Instance가 local active eligibility를 통과하지 못한다
- **THEN** 시스템은 Followers Only Note를 수신 relevance에서 제외한다
- **AND** Post 또는 PostContent side effect를 만들지 않는다

### Requirement: Exact-once Followers Only Post materialization

**Authority / Provenance:** `docs/domain/objects/post.md#activitypub-local-note-표현`, `docs/architecture/core-services.md#책임`, `PROD-360`. Active local Profile·Active local Instance의 established Follow Relationship으로 수신 관련성이 확인되고 이 capability의 Followers Only Post materialization 대상으로 판정된 Note는 기존 remote Post mapping·Post·PostContent 원자성 및 idempotency 계약을 재사용해 `PostVisibility.FOLLOWERS`로 정확히 한 번 materialize해야 한다(MUST). Reply projection 대상 여부와 그 결과는 별도 `activitypub-remote-reply-ingestion` capability가 소유한다.

#### Scenario: First relevant Followers Only materialization

- **WHEN** Active local Profile·Active local Instance established Follow Relationship relevance와 Note validation이 모두 통과하고, Note가 이 capability의 Followers Only Post materialization 대상이며 object URI가 아직 저장되지 않았다
- **THEN** 시스템은 기존 createPost transaction 경계에서 ActivityPub Post mapping, ACTIVE Post와 first PostContent를 함께 생성한다
- **AND** 저장된 Post visibility는 FOLLOWERS다
- **AND** followers membership 전체를 mirror하는 durable projection을 생성하지 않는다

#### Scenario: Duplicate or concurrent Followers Only delivery

- **WHEN** 이 capability의 Followers Only Post materialization 대상인 동일 Note object URI가 personal/shared inbox에서 중복되거나 동시에 최초 materialization을 시도한다
- **THEN** 하나의 mapping·Post·PostContent만 성공하고 나머지는 duplicate no-op으로 종료한다
- **AND** conflict loser가 만든 부분 row는 rollback한다
- **AND** 최초 visibility와 timestamp를 후속 duplicate가 변경하지 않는다

#### Scenario: Invalid Followers Only delivery has no side effect

- **WHEN** actor, object, attribution, canonical followers audience 또는 local relevance가 검증되지 않는다
- **THEN** 시스템은 Profile, ActivityPub Post mapping, Post와 PostContent를 생성하거나 변경하지 않는다
- **AND** 동일 object를 나중에 유효한 delivery로 다시 처리할 수 있다

### Requirement: Followers Only Post GraphQL access lifecycle

**Authority / Provenance:** `docs/domain/objects/post.md#조회-정책`, `docs/domain/policies/post-list.md#후보-정책`, `PROD-360`. 저장된 Followers Only Post는 기존 Post Visibility와 Post Eligibility를 적용해 established follower와 기존 정책이 허용하는 Author Profile에게 GraphQL Post surfaces를 제공해야 한다(MUST). inbound Note의 추가 actor URI는 별도 Mentioned Profile 관계나 viewer 권한을 만들지 않아야 한다(MUST).

#### Scenario: Accepted follower reads remote Followers Only Post

- **WHEN** current viewer Profile이 remote author를 current established Follow Relationship으로 팔로우하고
- **AND** Post와 Author Profile·Instance가 Post Eligibility를 통과한다
- **THEN** viewer는 기존 `Post` Node와 Post 상세를 조회할 수 있다
- **AND** `Profile.posts`와 `homeTimeline`은 해당 Post를 기존 pagination·ordering 계약에 따라 후보로 반환할 수 있다
- **AND** read path는 remote actor/object 재조회 없이 저장된 Post/PostContent와 기존 authorization policy만 사용한다

#### Scenario: Existing author access is preserved without an addressee grant

- **WHEN** current viewer Profile이 Followers Only Post의 Author Profile이고
- **AND** Post와 Author Profile·Instance가 Post Eligibility를 통과한다
- **THEN** viewer는 별도의 follower 관계가 없어도 기존 Post Visibility 계약에 따라 `Post` Node와 Post 상세를 조회할 수 있다
- **AND** 기존 Visibility가 허용하는 `Profile.posts`와 `homeTimeline` 후보 정책을 변경하지 않는다

#### Scenario: Extra actor URI does not grant viewer access

- **WHEN** Note의 `to`·`cc`에 local Profile의 actor URI가 추가되어 있지만 해당 Profile에 별도 Mentioned Profile 관계나 established Follow Relationship이 없다
- **THEN** 시스템은 그 Profile을 Followers Only Post의 viewer로 허용하지 않는다
- **AND** 해당 URI로 Mentioned Profile 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 생성하지 않는다

#### Scenario: Guest, non-follower, pending or reverse relation is denied

- **WHEN** viewer가 Author Profile이 아니고 guest이거나 remote author를 established Follow Relationship으로 팔로우하지 않거나
- **OR** viewer가 pending·rejected 상태이거나 author가 viewer를 반대로 팔로우할 뿐이다
- **THEN** 시스템은 해당 Followers Only Post를 `Post` Node, `Profile.posts`, `homeTimeline` 또는 상세에서 노출하지 않는다
- **AND** 해당 Post의 존재를 추론할 수 있는 별도 오류나 우회 surface를 제공하지 않는다

#### Scenario: Unfollow or suspension removes access

- **WHEN** materialized Followers Only Post의 local viewer가 unfollow한다
- **OR** Author Profile이 비활성화되거나 Author Instance가 suspended/domain-block 상태가 된다
- **THEN** 시스템은 해당 viewer 또는 모든 viewer의 Post Visibility·Post Eligibility를 재평가해 더 이상 허용되지 않는 조회를 차단한다
- **AND** 저장된 Post와 mapping을 접근 차단만을 위해 삭제하거나 visibility를 변경하지 않는다

#### Scenario: Reply/thread scope remains compositional

- **WHEN** verified remote actor의 remote Note가 지원되는 Followers Only audience와 local relevance를 통과하고 선택적인 `inReplyTo`/reply 관계를 가진다
- **THEN** 시스템은 reply/thread 존재 여부 자체를 actor, object, attribution, audience 또는 local relevance validation의 실패나 Note drop 사유로 사용하지 않는다
- **AND** validation을 통과한 Note의 reply handling/projection 여부와 결과는 별도 `activitypub-remote-reply-ingestion` capability가 소유하며, PROD-360은 그 결과를 새로 보장하지 않는다
- **AND** PROD-360의 reply/thread 별도 기능 확장 제외는 기존 generic remote reply projection을 막거나 Note를 drop하는 규칙을 만들지 않는다
- **AND** 이 capability는 Mention 관계, Notification, recipient authorization, body/tag Mention 보존·파싱, Local outbound Followers delivery와 별도 membership mirror를 새로 생성하지 않는다
