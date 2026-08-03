## Context

PROD-360은 현재 `to`·`cc`의 Public audience만 분류하는 remote Note 수신 경계를, 검증된 remote actor의 canonical followers collection과 Kosmo의 established Follow Relationship을 사용하는 Followers Only 수신으로 확장한다. 현재 `packages/fedify/src/inbound-create-note.ts`는 Public가 `to`에 있으면 PUBLIC, `cc`에 있으면 UNLISTED만 선택하고 그 밖의 audience를 건너뛴다. 반면 `packages/core/services/post.ts`의 ActivityPub `createPost`는 mapping·Post·PostContent를 transaction에서 만들고 object URI unique conflict를 duplicate로 처리하며, GraphQL은 `apps/api/src/graphql/resolvers/post/access/visibility.ts`와 `Profile.posts`·`homeTimeline` query에서 visibility와 Follow Relationship을 재사용한다.

## Goals / Non-Goals

**Goals:**

- `to` Public → PUBLIC, `cc` Public(그리고 to에는 없음) → UNLISTED, 그 밖의 verified author canonical followers URI → FOLLOWERS의 우선순위로 audience를 분류한다. 공식 ActivityPub/Mastodon addressing으로 추가된 구문상 유효하게 파싱된 actor/collection URI, 순서·중복과 foreign/unknown/spoofed-looking followers URI는 인식된 marker 뒤에서 무시한다. raw malformed audience syntax는 기존 vocabulary hydration/basic validation 경계에 남긴다.
- personal/shared inbox에서 Active local Profile·Active local Instance에 연결된 follower와 remote followee의 established 관계를 확인하고, 이 capability의 Followers Only Post materialization 대상으로 판정된 Note만 materialize한다.
- 기존 `createPost` transaction/idempotency와 GraphQL Post Visibility·Eligibility·pagination 정책을 그대로 연결한다.
- accepted follower 접근, unfollow·suspension에 따른 read-time 변화, 인식된 marker가 없는 actor-only·foreign-followers-only audience의 no-side-effect 결과를 검증한다.
- Note의 선택적 `inReplyTo`/reply 관계 자체는 actor·object·attribution·audience validation에서 Note를 drop하는 이유가 아니다. validation 뒤 reply handling/projection 대상 여부와 결과는 별도 `activitypub-remote-reply-ingestion` capability가 소유한다. PROD-360은 새 reply/thread 기능을 추가하지 않으며 기존 generic remote reply projection을 막는 규칙도 만들지 않는다.

**Non-Goals:**

- DB migration, followers membership mirror, 전체 과거 Note backfill, Local outbound Followers delivery.
- DIRECT/limited recipient 모델, Mention 관계·notification·viewer authorization, body/tag Mention 보존·파싱, reply/thread 별도 기능 확장 또는 remote Media 확장. 이 scope exclusion은 기존 generic remote reply projection을 제한하거나 reply Note를 drop하는 규칙이 아니다. Reply handling/projection의 실제 대상과 결과는 별도 capability가 결정한다.
- PROD-634가 소유하는 공통 logging/Sentry 계측의 신규 구현.

## Implementation Guidance

### Current Constraints

- Inbox entry가 actor signature·object identity와 stored remote Profile eligibility를 검증한 뒤 Note adapter에 전달한다. Followers collection URI를 문자열로 신뢰하거나 별도 actor refresh로 권한을 만들면 안 된다.
- `createPost({ origin: 'ACTIVITYPUB', ... })`는 Post mapping unique URI, PostContent와 remote Media를 하나의 transaction에 넣고 conflict를 duplicate no-op으로 바꾼다. 새 follower path에서 별도 insert/lock/recovery transaction을 만들 필요가 없다.
- GraphQL Post Node와 `Profile.posts`·`homeTimeline`은 공통 `postVisibilityAccessCondition`/`postAccessWhere`와 page-limit 전 visibility filter를 사용한다. 이 경계 밖에서 follower 전용 query 예외를 만들면 Node와 목록이 어긋난다.
- Follow Relationship은 별도 상태를 가진 객체가 아니며 현재 관계 row가 established 관계를 뜻한다. inbound Followers Only relevance는 여기에 Active local Profile·Active local Instance eligibility를 추가로 요구하고, GraphQL read access는 기존 viewer→author 관계와 Profile/Instance eligibility 정책을 유지한다. pending/rejected 요청이나 unfollow 뒤에는 현재 관계가 없다.

### Recommended Approach

1. verified remote actor의 저장된 canonical followers URI와 Note `to`·`cc`를 대조해 `to Public → PUBLIC`, `cc Public(그리고 to에는 없음) → UNLISTED`, 그 밖의 author canonical followers URI → FOLLOWERS 순으로 한 번만 분류한다. 인식된 marker가 있으면 구문상 유효하게 파싱된 extra actor/collection URI·순서·중복·foreign/unknown/spoofed-looking followers URI는 분류에 사용하지 않는다.
2. FOLLOWERS 후보는 personal inbox의 대상 Active local Profile 또는 shared inbox에서 확인된 Active local Profile·Active local Instance follower와 remote followee의 방향 관계를 조회한다. author canonical marker가 없고 actor-only·foreign-followers-only audience만 있으면 write 전에 skip하며, canonical marker가 있으면 foreign extra URI를 분류하려고 network dereference나 `/followers` 경로 휴리스틱을 사용하지 않는다.
3. 승인된 입력만 기존 remote content projection과 `createPost`에 전달하고 visibility를 FOLLOWERS로 넘긴다. mapping URI unique conflict는 기존 first-write-wins/no-op 경로를 사용한다.
4. GraphQL은 기존 visibility helper와 list candidate 정책을 재사용해 Author Profile의 기존 허용을 보존하면서 non-author viewer에는 established follower 관계를 요구한다. Note의 추가 actor URI는 Mention 관계·notification·DIRECT/limited recipient authorization·viewer access를 만들지 않으며, 관계 제거와 Profile/Instance eligibility 변화는 저장물을 삭제하지 않고 read-time에서 반영한다.
5. Fedify fixture는 Public-to + extra mentioned actor, Public-cc + extra mentioned actor, canonical followers personal/shared + extra mentioned actor, actor-only/foreign-followers-only no-op, pending/unfollow, duplicate/concurrent와 guest/reverse/suspension read를 함께 검증한다. PROD-634가 제공하는 공통 결과 계약이 있을 때만 outcome/phase/reason compatibility를 assert하고 계측 자체는 이 change에 복제하지 않는다.

### Allowed Alternatives

- audience 분류와 local relevance 확인을 같은 adapter에 두거나 별도 transport-neutral helper로 나눌 수 있다. 어느 쪽이든 verified actor identity를 입력으로 받고 public priority, canonical match와 no-side-effect 경계를 유지해야 한다.
- relation existence를 `EXISTS` predicate 또는 동등한 join으로 조회할 수 있다. GraphQL Node·Profile list·Home이 동일한 visibility 결과와 page-limit 전 filtering을 유지해야 한다.

### Known Traps

- followers collection URI 문자열, body/tag Mention, personal/shared inbox route 또는 delivery 수신 사실만으로 권한을 부여하지 않는다. spoofed-looking URI 자체도 권한 근거가 아니다.
- Public가 `cc`에 있더라도 `to` Public 우선순위를 잃지 않는다. Public가 없고 author canonical marker가 있으면 collection 중복·구문상 유효하게 파싱된 foreign/unknown/spoofed-looking followers extra URI가 있어도 FOLLOWERS를 유지하며, author canonical marker가 전혀 없을 때만 actor-only·foreign-followers-only audience를 no-op으로 건너뛴다.
- 인식된 marker가 있는 Note의 구문상 유효하게 파싱된 extra actor/collection URI 때문에 audience 전체를 거절하거나, 검증 가능한 collection 개수만으로 거절하지 않는다. raw malformed audience syntax는 기존 vocabulary hydration/basic validation에서 처리한다.
- author canonical followers marker가 있는 경우 foreign/unknown collection을 분류하기 위한 network dereference나 `/followers` 경로 휴리스틱을 추가하지 않는다.
- pending/rejected Follow Request, reverse relation, unfollow를 established follower로 취급하지 않는다.
- invalid audience를 projection/write 뒤에 검증하거나 duplicate race에서 recovery transaction·explicit mapping lock을 추가하지 않는다.
- page limit 전에 visibility/eligibility를 적용하지 않거나 Author Profile의 기존 접근을 follower 조건으로 덮어쓰지 않는다.
- extra actor URI에서 Mention 관계, Notification, DIRECT/limited recipient authorization 또는 viewer access를 생성하지 않는다.
- raw activity body, signature, credential을 logging/Sentry payload에 넣지 않으며 PROD-634의 공통 관측 책임을 재구현하지 않는다.

## Risks / Trade-offs

- [Risk] author canonical followers marker가 없는 외부 audience는 Followers Only로 분류할 수 없어 정상 게시물이 누락될 수 있다. → verified actor의 저장 canonical identity만 사용하고 actor-only·foreign-followers-only audience를 재시도 가능한 no-op으로 남긴다.
- [Risk] 수신 시점의 Follow Relationship 조회가 inbox 처리 비용을 늘릴 수 있다. → 기존 relation/index와 공통 access policy를 재사용하고 membership mirror를 추가하지 않는다.
- [Risk] 수신 뒤 unfollow·suspension이 발생하면 저장된 Post가 일부 viewer에게 더 이상 보이지 않는다. → Post row를 변경하지 않고 기존 read-time Visibility·Eligibility를 매번 적용한다.

## Migration Plan

DB schema와 durable membership model은 변경하지 않는다. 새 inbound 분류·relevance 경계를 배포하고 기존 PUBLIC/UNLISTED fixture와 GraphQL 회귀를 함께 실행한다. 롤백 시 Followers Only inbound 분류만 중지하며 이미 저장된 Post는 기존 visibility 정책으로 계속 보호한다. 별도 backfill이나 데이터 삭제는 수행하지 않는다.

## Open Questions

- PROD-634가 소유하는 공통 inbound 관측의 안정적인 `outcome`·`phase`·`reason` 값은 현재 이 change에서 새로 정하지 않는다. 해당 authority가 제공되기 전에는 구현·spec에서 enum 값을 발명하지 않고, compatibility 검증은 계약이 확인된 뒤에만 추가한다.
