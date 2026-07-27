## Context

현재 `packages/fedify`의 inbound Create 경로는 known ActivityPub actor의 hydrated `Note`를 검증한 뒤 `@kosmo/core/services.createPost`에 전달한다. 이 경로는 top-level Note의 Post, ActivityPub mapping, PostContent를 이미 하나의 transaction으로 저장하며 object URI conflict를 first-write-wins로 처리한다. `PROD-393` 이후 `createPost`는 선택적 `replyParentId`와 Content Parent 검증도 같은 transaction에서 지원한다.

PROD-494는 `packages/fedify`에 Post ID에서 Local 또는 Remote ActivityPub identity를 구하는 공통 resolver를 추가했다. 반대 방향인 ActivityPub URI에서 저장된 Post를 찾는 경계는 아직 없고, 현재 inbound handler는 Reply를 모두 제외한다.

## Goals / Non-Goals

**Goals:**

- 원격 Note의 `inReplyTo`를 protocol identity로 검증하고 저장된 Post identity로 해석한다.
- 기존 `createPost` transaction과 duplicate 처리에 `replyParentId`만 연결한다.
- Local canonical Note URI와 Remote mapping URI를 모두 같은 Parent identity 경계에서 지원한다.
- 기존 top-level Note ingestion과 GraphQL Post 조회를 회귀시키지 않는다.

**Non-Goals:**

- 미해석 Parent의 fetch, 재귀 materialization, queue, retry 또는 기존 top-level Post의 Parent update/backfill 정책
- Parent fetch를 장기적으로 수행할지 여부나 실행 한계의 확정
- ActivityPub Quote/Repost, Local Reply delivery, Reply Notification
- DB migration, 새 GraphQL field/type, 별도 raw `inReplyTo` 저장

## Implementation Guidance

### Current Constraints

- `Note.replyTargetIds`는 fetch 없이 protocol IRI를 제공한다. 현재 slice는 embedded target hydration을 요구하지 않으며 usable ID가 없으면 top-level fallback으로 처리할 수 있다.
- Local Post는 `activitypub_post` mapping row가 없으므로 remote mapping lookup만으로 Parent를 찾을 수 없다. 반대로 mapping 부재만으로 Local Post라고 가정해서도 안 된다.
- Fedify context는 등록된 Local Note object route와 canonical origin을 기준으로 `parseUri()`를 제공한다. Local identity를 별도 정규식과 origin 재조립으로 중복 구현할 필요가 없다.
- `createPost`는 Parent Content 검증과 atomic link를 이미 소유한다. inbound handler가 Post/Content를 별도 insert하면 transaction과 duplicate contract가 갈라진다.

### Recommended Approach

1. inbound Note 경계에서 `replyTargetIds`가 정확히 하나의 HTTP(S) URI로 해석되면 Parent identity lookup 입력으로 사용한다. 모호하거나 지원하지 않는 형식과 usable ID 없는 embedded target은 Parent 없는 입력과 동일하게 top-level fallback으로 처리하며 object hydration을 호출하지 않는다.
2. `packages/fedify`의 기존 Post identity resolver 옆에 Content 여부와 독립적인 reverse lookup을 둔다. Local URI는 Fedify `context.parseUri()`가 등록된 Note object route로 해석한 ID를 사용하고, Remote URI는 mapping의 exact URI로 찾는다.
3. Parent identity가 없으면 기존 top-level `createPost` 경로를 그대로 사용한다. identity가 있으면 `replyParentId`를 전달하고, 기존 core 생성 계약이 Parent Content 적합성을 거부하면 같은 Note를 top-level로 다시 materialize한다.
4. Parent가 해석되면 기존 `createPost` ActivityPub input에 `replyParentId`를 추가한다. 이로써 Post, mapping, Content와 Parent link가 같은 transaction 및 기존 URI unique-conflict 처리 안에 남는다.
5. unit/DB integration test는 top-level 회귀, Local/Remote Parent, invalid cardinality/scheme, unknown/contentless Parent의 top-level fallback, no Parent fetch, duplicate와 GraphQL 기존 field 호환을 검증한다.

### Allowed Alternatives

- reverse lookup 내부를 Local/Remote helper로 분리하거나 하나의 query 경계로 유지할 수 있다. 단, Fedify가 인식한 Local Note route, Remote mapping exact 비교, Content와 독립적인 identity lookup은 유지해야 한다.
- Parent Content 조건은 기존 `createPost`를 최종 transaction guard로 사용한다. 부적합 Parent가 예상된 inbox 입력으로 처리되어 top-level fallback 외의 부분 row나 처리 실패를 만들지 않아야 한다.

### Known Traps

- `getReplyTarget()`으로 remote Parent를 hydrate하면 필요 없는 fetch 경계와 오류 처리가 생긴다. `replyTargetIds`만 사용한다.
- `/ap/note/{uuid}`를 직접 파싱하면 Fedify에 실제 등록된 route와 canonical origin 규칙을 중복한다.
- unknown Parent를 top-level Post로 저장하면 duplicate Create만으로 관계를 복구할 수 없다. 향후 복구는 별도 update/backfill lifecycle이 소유해야 한다.
- raw `inReplyTo` URI를 새 column에 저장하면 ActivityPub mapping과 Reply Parent 외의 source of truth가 생긴다.
- duplicate delivery에서 Parent를 다시 연결하거나 변경하면 remote Create의 first-write-wins 계약을 위반한다.

## Risks / Trade-offs

- [Risk] Parent보다 Reply가 먼저 도착하면 top-level Post로 보이고 duplicate delivery만으로 관계가 복구되지 않는다. → 현재 fallback과 first-write-wins를 검증하고 장기 fetch/update/backfill 정책은 후속 계약에 남긴다.
- [Risk] Local URI reverse parsing이 outbound identity 규칙과 갈라질 수 있다. → Fedify의 등록된 object route parser를 재사용한다.
- [Risk] Parent가 lookup 뒤 변경될 수 있다. → `createPost` transaction의 Content Parent 검증을 최종 guard로 유지한다.

## Migration Plan

1. reverse identity lookup과 inbound Reply 분기를 배포한다. schema/migration 변경은 없다.
2. 기존 top-level Create, personal/shared inbox와 duplicate concurrency 회귀를 함께 검증한다.
3. 문제가 있으면 Parent 연결 분기만 제거해 top-level-only 동작으로 되돌릴 수 있다. 이미 정상 저장된 Reply는 기존 canonical Post 관계이므로 별도 data rollback이 필요하지 않다.

## Open Questions

- Parent fetch, 재귀 materialization, retry/queue, 기존 top-level Post의 Parent update/backfill과 실행 비용 제한은 PROD-358에서 결정하지 않으며 후속 계약에서 정한다.
