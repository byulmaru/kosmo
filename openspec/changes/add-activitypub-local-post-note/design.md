## Context

현재 `packages/fedify`는 Fedify federation instance, `/ap/actor/{identifier}` actor dispatcher,
actor-scoped/shared inbox와 Follow 계열 delivery를 소유한다. `apps/web`은 모든 요청을 Fedify에 먼저 전달하고,
Fedify가 처리하지 않은 요청만 기존 BFF와 SPA로 넘긴다. configured Local Instance의 canonical origin은
`PUBLIC_ORIGIN`과 일치하는 Local/Active Instance row에서 해석되며 actor와 Follow URI에 이미 사용된다.

Post, current PostContent, Author Profile/Instance, established ProfileFollow와 remote ActivityPub Post mapping은
PostgreSQL에 존재하지만 Local Note object dispatcher는 없다. PROD-341의 server-only ProseMirror schema와
validation은 이미 존재하지만 node/mark spec에 `toDOM`이 없어 `DOMSerializer.fromSchema()`를 사용한 HTML
export는 아직 완성되지 않았다. 현재 `post.reply_parent_id` self-FK는 delete action을 명시하지 않으며, Post
삭제 행동은 row 삭제가 아니라 `DELETED` state의 canonical Tombstone 전이다.

## Goals / Non-Goals

**Goals:**

- Local Post의 안정적인 `/ap/note/{postId}` identity와 Fedify Note 역참조를 제공한다.
- PROD-341의 canonical PostContent schema를 재정의하지 않고 ProseMirror serialization으로 HTML을 export하며
  audience와 authorized fetch를 Post Visibility에 맞춘다.
- Local/Remote Parent identity를 같은 경계에서 해석하고 requester와 무관한 `inReplyTo`를 제공한다.
- physical delete application 흐름은 추가하지 않고 Reply Parent FK만 미래 row 삭제에 대비해 `SET NULL`로 바꾼다.
- 기존 federation-first routing, actor/inbox 동작과 remote Post mapping 경계를 회귀시키지 않는다.

**Non-Goals:**

- Reply `Create`/`Delete`, Repost `Announce`/`Undo`, Reaction `Like`/`EmojiReact`/`Undo` delivery
- ActivityPub Tombstone/Delete, outbox collection, delivery queue, retry와 backfill
- followers/following collection endpoint 또는 actor document의 followers/following 속성
- Mentioned Profiles recipient, Mention, custom emoji와 Quote 전용 federation 표현
- Media 표현은 이 change의 원래 구현 범위가 아니며 후속 ADR 0022와 `attach-local-media-to-post` change가 확장한다.
- remote Post ingestion과 기존 GraphQL Post read 계약 변경
- PostContent node·mark·canonicalization·validation 계약 변경
- Parent Post physical delete service/API

## Implementation Guidance

### Current Constraints

- Fedify `Context.canonicalOrigin`과 core configured Local Instance가 같은 canonical origin을 가리켜야 한다. 요청
  `Host`, API origin이나 Web client runtime origin에서 Note URI를 조립하면 actor identity와 갈라질 수 있다.
- Local/Remote Post는 같은 `post` table을 사용한다. Local 여부는 mapping 부재만으로 판정하면 안 되고 Author가
  configured Local Instance에 속하는지 확인해야 한다. Local Post에는 remote mapping을 만들지 않는 것이 계약이다.
- GraphQL의 viewer visibility predicate는 session Profile을 전제로 한다. signed HTTP request의 key owner URI를
  Profile로 해석하는 federation authorization에는 그대로 재사용할 수 없다.
- `ProfileFollow` 방향은 remote requester Profile이 follower, Local Author Profile이 followee다. pending
  `ProfileFollowRequest`는 established follow가 아니므로 Followers Only 접근을 허용하지 않는다.
- `activitypub-note-content`는 inbound remote HTML을 canonical document로 변환한다. outbound Local Note는 반대
  방향이지만 PROD-341의 ProseMirror schema를 다시 손으로 순회하면 canonical node·mark 책임을 중복한다. 현재
  schema spec에는 `parseDOM`만 있고 `toDOM`이 없어 DOMSerializer를 사용하려면 그 serialization metadata를
  보완해야 한다.
- Parent visibility를 Note 조회 query에 결합하면 같은 Reply 표현이 requester별로 달라지고, Tombstone Parent
  identity도 잃는다. Reply 자체의 authorization과 Parent identity projection을 분리해야 한다.
- 현재 Reply Parent FK에는 `ON DELETE SET NULL`이 없다. Drizzle 선언과 forward migration의 실제 constraint가
  함께 바뀌어야 schema push와 migration DB가 일치한다.

### Recommended Approach

1. `packages/fedify`에 Post DB UUID를 받는 공통 Post identity 경계를 둔다. Local Post는 Author Profile이 속한
   `Instances.canonicalOrigin`에서 Note URI를 파생하고 Remote Post는 existing mapping URI를 반환한다. 후속
   federation activity는 이 경계를 재사용한다.
2. Fedify에 `Note` object dispatcher `/ap/note/{id}`를 등록한다. dispatcher load는 Post, current Content, Author
   Profile/Instance와 direct Parent identity에 필요한 최소 열을 한 경계에서 읽고 Local/Active/contentful 조건을
   먼저 확인한다.
3. 별도의 signed-fetch authorization 경계에서 key owner URI를 저장된 ActivityPub actor/Profile로 해석한다.
   Public/Unlisted는 anonymous를 허용하고 Followers Only는 Author 또는 established Follower만 허용한다.
   Mentioned Profiles와 unavailable Post는 원인을 구분하지 않는 미제공 결과로 수렴시킨다.
4. Author followers collection identity는 canonical actor URI에 `/followers`를 붙인
   `/ap/actor/{authorProfileId}/followers`로 사용한다. 이는 audience address이며 이 변경에서 collection GET이나
   actor `followers` 속성을 열지 않는다.
5. PROD-341 ProseMirror node/mark spec에 기존 schema 의미와 일치하는 `toDOM`을 보완하고, canonical document를
   `Schema.nodeFromJSON()`으로 검증한 뒤 `DOMSerializer.fromSchema()`로 Note HTML을 만든다. 별도 수동 node
   renderer나 앱의 React Native renderer를 재사용하지 않는다. summary는 Plain Text 의미를 유지한 안전한 HTML
   text로 export하고 빈 Content Warning을 만들지 않는다.
6. `inReplyTo`는 load된 direct relation의 identity만 사용한다. Parent visibility와 lifecycle로 다시 필터링하지
   않으며 Parent Content를 함께 load하거나 embed하지 않는다. relation이 `null`일 때만 생략한다.
7. Followers Only 역참조 권한은 Fedify object dispatcher의 `.authorize()`에서 판정하고 Web은 Fedify가 만든
   응답을 그대로 반환한다. requester 표시나 별도 응답 cache policy를 애플리케이션에 추가하지 않는다.
8. Reply Parent self-FK를 drop/recreate하는 forward migration으로 delete action을 `SET NULL`로 바꾸되 기존 row를
   update하지 않는다. physical delete application 경로는 추가하지 않고 Drizzle schema·migration snapshot의
   constraint 선언을 정렬한다.

### Allowed Alternatives

- Post identity resolver의 public 결과와 `packages/fedify` 소유권은 고정한다. 내부 query/helper 분리는 달라질 수
  있다.
- ProseMirror DOMSerializer를 감싸는 adapter와 DOM document 제공 방식은 달라질 수 있지만 별도 수동 node
  renderer로 schema 의미를 복제하지 않는다.
- Fedify가 생성한 object response에 애플리케이션별 header를 추가하지 않는다. 배포 계층의 cache 정책은 이
  capability의 구현 범위가 아니다.

### Known Traps

- request URL이나 `Host` header로 Note `id`를 만들면 reverse proxy와 alternate host에서 identity가 달라진다.
- mapping row가 없다는 이유만으로 Local Post로 판정하면 mapping이 아직 없는 Remote Post 또는 잘못된 row를
  Local URI로 노출할 수 있다.
- Followers Only authorization에서 actor URI 문자열만 비교하거나 pending FollowRequest를 허용하면 저장된
  established relationship 계약을 우회한다.
- Parent visibility를 확인해 `inReplyTo`를 생략하면 requester별 표현이 달라진다.
- inbound HTML parser, 앱 React Native renderer 또는 수동 JSON 순회를 outbound serializer로 사용하면
  ProseMirror schema 의미와 책임을 중복한다.
- Tombstone update에서 `reply_parent_id`를 직접 nullify하거나 Parent row에 cascade delete를 사용하면 승인된
  Reply lifecycle을 위반한다.
- object dispatcher를 BFF 뒤에 연결하면 ActivityPub 요청이 GraphQL proxy 또는 SPA fallback으로 잘못 처리될 수
  있다.

## Risks / Trade-offs

- [Risk] Tombstone Parent URI는 `inReplyTo`에 남지만 직접 역참조할 수 없다. → identity와 Content 권한을 분리한
  canonical 계약으로 유지하고 Parent Content를 Reply에 embed하지 않는다.
- [Risk] Followers collection URI는 audience에 사용되지만 collection endpoint는 404다. → 이번 scope에서는
  address identity로만 사용하고 endpoint 공개는 별도 계약 전까지 열지 않는다.
- [Risk] Fedify의 success response는 signed requester별 cache 격리를 위한 별도 header를 제공하지 않는다. →
  Fedify와 Hackers' Pub의 object dispatcher 경계와 같이 `.authorize()`에서 직접 접근을 제한하며, 배포 계층의
  cache 정책은 별도 운영 계약에서 다룬다.
- [Risk] FK를 `SET NULL`로 바꾼 뒤 실제 physical delete가 발생하면 Parent identity는 복구할 수 없다. → 현재
  사용자 삭제는 Tombstone이라 영향을 받지 않으며 migration과 rollback 문서에서 비가역 가능성을 명시한다.
- [Risk] `toDOM` metadata가 existing parse/canonical schema와 어긋날 수 있다. → 같은 ProseMirror schema의
  nodeFromJSON/check/DOMSerializer 경계와 PROD-341 fixtures로 round-trip 의미를 검증한다.

## Migration Plan

1. 기존 schema의 Reply Parent FK 이름과 delete action을 정적 검토한다.
2. forward migration으로 기존 FK를 `ON DELETE SET NULL` self-FK로 교체한다. column nullability, self-reference
   check와 index는 유지하고 data update/backfill을 수행하지 않는다.
3. Drizzle schema·migration snapshot의 FK nullification 선언을 정렬하고, Parent Tombstone 관계 보존은 Local
   Note·Reply 제품 테스트로 검증한다. physical delete application path나 이를 모사하는 fixture는 만들지 않는다.
4. Local Note identity/projection과 dispatcher를 배포하고 Public/Unlisted/Follower signed fetch 및 web routing
   회귀를 검증한다.
5. rollback이 필요하면 dispatcher 노출을 제거하고 FK를 기존 delete action으로 되돌릴 수 있다. 이미 물리 삭제로
   null이 된 관계는 자동 복구할 수 없지만 현재 canonical Post 삭제 경로는 physical delete를 수행하지 않는다.

## Open Questions

없음.
