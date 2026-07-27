## Context

현재 `packages/fedify`의 inbound Create 경로는 known ActivityPub actor의 hydrated `Note`를 검증한 뒤 `@kosmo/core/services.createPost`에 전달한다. 이 경로는 top-level Note의 Post, ActivityPub mapping, PostContent를 이미 하나의 transaction으로 저장하며 object URI conflict를 first-write-wins로 처리한다. `PROD-393` 이후 `createPost`는 선택적 `replyParentId`와 Content Parent 검증도 같은 transaction에서 지원한다.

PROD-494는 `packages/fedify`에 Post ID에서 Local 또는 Remote ActivityPub identity를 구하는 공통 resolver를 추가했다. 반대 방향인 ActivityPub URI에서 저장된 Post를 찾는 경계는 아직 없고, 현재 inbound handler는 Reply를 모두 제외한다.

## Goals / Non-Goals

**Goals:**

- 원격 Note의 `inReplyTo`를 protocol identity로 검증하고 저장된 Content Post로 해석한다.
- 기존 `createPost` transaction과 duplicate 처리에 `replyParentId`만 연결한다.
- Local canonical Note URI와 Remote mapping URI를 모두 같은 Parent identity 경계에서 지원한다.
- 기존 top-level Note ingestion과 GraphQL Post 조회를 회귀시키지 않는다.

**Non-Goals:**

- 미해석 Parent의 fetch, 재귀 materialization, queue, retry 또는 backfill 정책
- Parent fetch를 장기적으로 수행할지 여부나 실행 한계의 확정
- ActivityPub Quote/Repost, Local Reply delivery, Reply Notification
- DB migration, 새 GraphQL field/type, 별도 raw `inReplyTo` 저장

## Implementation Guidance

### Current Constraints

- `Note.replyTargetIds`는 protocol IRI를 제공하지만 embedded target에 usable ID가 없는 경우도 구분해야 한다. Parent object hydration을 위해 `getReplyTarget()`을 호출하면 현재 slice의 network 경계를 넘을 수 있으므로, identifier가 있는 Parent를 fetch해서는 안 된다.
- Local Post는 `activitypub_post` mapping row가 없으므로 remote mapping lookup만으로 Parent를 찾을 수 없다. 반대로 mapping 부재만으로 Local Post라고 가정해서도 안 된다.
- Local identity는 저장된 Author Instance canonical origin과 exact `/ap/note/{postId}` 조합이다. 요청 Host나 현재 환경 문자열만 비교하면 configured identity와 어긋날 수 있다.
- `createPost`는 Parent Content 검증과 atomic link를 이미 소유한다. inbound handler가 Post/Content를 별도 insert하면 transaction과 duplicate contract가 갈라진다.

### Recommended Approach

1. inbound Note 경계에서 `inReplyTo` 존재 여부와 unique URI cardinality를 분리해 판정한다. identifier가 있으면 정확히 하나의 HTTP(S) URI만 허용하고, embedded target이지만 usable ID가 없으면 invalid Reply로 처리한다. Parent identifier를 remote document loader로 hydrate하지 않는다.
2. `packages/fedify`의 기존 Post identity resolver 옆에 reverse lookup을 둔다. Remote URI는 mapping의 exact URI로 찾고, Local URI는 canonical UUID path 후보를 추출한 뒤 저장된 Local Instance canonical origin에서 파생한 exact URI와 다시 비교한다. 두 경우 모두 current Content가 있는 Post만 반환한다.
3. Parent가 해석되지 않으면 현재 delivery를 아무 row 없이 종료한다. 이 분기는 현재 구현 범위의 동작일 뿐 장기 retry/fetch 정책을 표현하지 않는다.
4. Parent가 해석되면 기존 `createPost` ActivityPub input에 `replyParentId`를 추가한다. 이로써 Post, mapping, Content와 Parent link가 같은 transaction 및 기존 URI unique-conflict 처리 안에 남는다.
5. unit/DB integration test는 top-level 회귀, Local/Remote Parent, invalid cardinality/scheme, unknown/contentless Parent, no Parent fetch, duplicate/retry와 GraphQL 기존 field 호환을 검증한다.

### Allowed Alternatives

- reverse lookup 내부를 Local/Remote helper로 분리하거나 하나의 query 경계로 유지할 수 있다. 단, Local identity exact 비교, Remote mapping exact 비교, Content Parent 조건과 network 호출 없음은 유지해야 한다.
- Parent Content 조건을 reverse lookup과 `createPost` 양쪽에서 방어하거나 `createPost`를 최종 transaction guard로 사용할 수 있다. invalid Parent가 예상된 inbox 입력으로 처리되어 부분 row나 처리 실패를 만들지 않아야 한다.

### Known Traps

- `getReplyTarget()`으로 remote Parent를 hydrate하면 제외 범위인 Parent fetch를 암묵적으로 구현한다.
- `/ap/note/{uuid}` 모양만 보고 Local Post를 연결하면 다른 origin의 공격자 URI가 Local identity로 오인될 수 있다.
- unknown Parent를 top-level Post로 저장하면 원래 `inReplyTo` 관계를 복구하기 위한 update lifecycle이 필요해지고 canonical Reply 구조를 잃는다.
- raw `inReplyTo` URI를 새 column에 저장하면 ActivityPub mapping과 Reply Parent 외의 source of truth가 생긴다.
- duplicate delivery에서 Parent를 다시 연결하거나 변경하면 remote Create의 first-write-wins 계약을 위반한다.

## Risks / Trade-offs

- [Risk] Parent보다 Reply가 먼저 도착하면 현재 delivery에서 Reply가 보이지 않는다. → 부분 Post를 만들지 않고, Parent 저장 뒤 같은 Create 재전달이 현재 상태를 다시 평가하도록 검증한다. 장기 fetch/retry 정책은 후속 계약에 남긴다.
- [Risk] Local URI reverse parsing이 outbound identity 규칙과 갈라질 수 있다. → 후보 UUID만 추출한 뒤 저장된 canonical origin에서 identity를 재구성해 exact URI로 비교한다.
- [Risk] Parent가 lookup 뒤 변경될 수 있다. → `createPost` transaction의 Content Parent 검증을 최종 guard로 유지한다.

## Migration Plan

1. reverse identity lookup과 inbound Reply 분기를 배포한다. schema/migration 변경은 없다.
2. 기존 top-level Create, personal/shared inbox와 duplicate concurrency 회귀를 함께 검증한다.
3. 문제가 있으면 inbound Reply 분기만 제거해 이전 top-level-only 동작으로 되돌릴 수 있다. 이미 정상 저장된 Reply는 기존 canonical Post 관계이므로 별도 data rollback이 필요하지 않다.

## Open Questions

- Parent fetch, 재귀 materialization, retry/queue와 실행 비용 제한은 PROD-358에서 결정하지 않으며 후속 계약에서 정한다.
