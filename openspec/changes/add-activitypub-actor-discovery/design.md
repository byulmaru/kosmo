## Context

kosmo의 공개 웹 origin은 이미 `/@{handle}` 프로필 페이지와 `/graphql` proxy를 제공한다. API 서버는 Hono/GraphQL을 별도 origin에서 실행하고, 브라우저 클라이언트는 웹 서버를 통해 API로 요청을 전달한다. ActivityPub discovery는 외부 fediverse 서버가 접근하는 HTTP surface이므로 API origin이 아니라 canonical 웹 origin에서 제공해야 한다.

Fedify는 actor dispatcher와 WebFinger 처리를 federation instance 안에 묶어 제공한다. 이번 변경은 Fedify를 `apps/web` SvelteKit hook에 연결하되, `apps/web`은 hook composition만 담당한다. federation request 판별, WebFinger 응답 조립, actor 조회, actor document assembly, key dispatch 같은 ActivityPub 로직은 `packages/fedify`가 소유하게 해 웹 라우팅 adapter와 federation 도메인 로직을 분리한다.

## Goals / Non-Goals

**Goals:**

- 외부 서버가 `acct:{handle}@{localHost}` WebFinger 조회로 local active profile의 actor URI를 발견할 수 있게 한다.
- local actor URI를 `{localOrigin}/ap/actor/{profile.id}`로 고정하고, `profile.id` raw DB UUID를 ActivityPub actor identifier로 사용한다.
- local actor document가 프로필 표시 정보, ActivityPub actor 필수 `inbox`/`outbox` URI, 공개 key를 담은 최소 `Person` 문서를 반환하게 한다.
- `instance`와 ActivityPub profile 저장 경계를 잡아 이후 remote fetch/follow/delivery가 같은 모델 위에서 확장될 수 있게 한다.
- 표시용 handle 정책을 configured local instance 기준 `Profile.relativeHandle` 서버 필드로 모아 UI별 문자열 조합을 피한다.

**Non-Goals:**

- remote follow 수신/발신, inbox/outbox delivery/submission/collection 동작, shared inbox, followers/following collection 제공.
- remote actor fetch/cache 동작, TTL, retry, signature verification 정책 구현.
- handle rename, 이전 handle alias/history, WebFinger redirect.
- 저장된 remote profile의 UI 연결, active profile 선택, remote profile 대상 local follow graph 확장, remote profile posts fetch.
- ActivityPub 게시물, Note object, Create/Follow/Accept/Undo activity 송수신.

## Decisions

- **ActivityPub surface는 웹 origin에 둔다.** actor URI와 WebFinger subject는 외부 서버가 보는 공개 identity이므로 `PUBLIC_API_ORIGIN`이 아니라 canonical 웹 origin을 사용한다. 대안인 API origin 노출은 브라우저 API transport와 federation identity가 갈라지고, API 서버 배포 topology가 공개 actor URI에 새겨지는 문제가 있어 배제한다.
- **Fedify 연결은 `apps/web` hook adapter, federation 로직은 `packages/fedify`가 소유한다.** `packages/fedify`는 framework-neutral federation instance/request handler 구성요소를 export하고, `apps/web`은 `hooks.server.ts`에서 이를 `@fedify/sveltekit` hook adapter로 SvelteKit `handle`에 연결한다. federation 요청 판별, WebFinger resource parsing/JRD 응답 조립, actor assembly, key dispatch는 package로 분리해 Svelte component, SvelteKit route handler, web hook 본문에 ActivityPub 세부를 넣지 않는다.
- **actor URI는 `/ap/actor/{profile.id}`와 raw DB UUID를 쓴다.** `/@{handle}`를 actor URI로 겸용하면 HTML route와 content negotiation이 강하게 결합되고, handle rename 가능성을 닫는다. Relay global ID는 GraphQL API 표현이므로 ActivityPub URI에 쓰지 않는다.
- **WebFinger handle과 actor identifier를 분리한다.** WebFinger username은 local `profile.handle`이고, actor identifier는 `profile.id`다. Fedify handle mapper는 `acct:{handle}@{domain}`을 local active profile UUID로 매핑한다.
- **configured local instance row가 canonical origin/host의 source of truth다.** `localOrigin`은 `PUBLIC_ORIGIN`과 일치하는 configured local instance의 `canonical_origin`이며 actor URI, WebFinger self link, profile-page link, key ID 같은 local absolute URL을 만들 때만 사용한다. `localHost`는 그 origin에서 정규화한 WebFinger host다. 요청 URL origin, Host header, `PUBLIC_API_ORIGIN`을 따라 actor URI를 만들면 동일 프로필의 federated identity가 흔들린다. `PUBLIC_ORIGIN`은 local instance row를 만들거나 현재 deployment가 사용할 local instance row를 검증하는 입력으로만 사용한다. 서로 다른 host의 `LOCAL` rows는 이후 multi-local-instance 확장을 위해 허용할 수 있지만, 현재 deployment의 federation identity는 `PUBLIC_ORIGIN`에 매칭되는 row 하나에서 결정한다. `packages/core`는 setup/migration에서 local instance row를 생성하거나 검증하는 bootstrap helper와, runtime에서 row를 새로 만들지 않고 읽기/검증만 수행하는 resolve helper를 분리해 소유한다. `packages/fedify`와 `apps/api`는 runtime resolve helper를 공유한다.
- **profile은 local/ActivityPub 공통 social identity로 확장한다.** remote ActivityPub media 설계에서 remote actor/profile identity를 `Profile`이 표현한다는 기존 방향과 맞춘다. handle uniqueness는 전역이 아니라 `(instance_id, normalized_handle)`로 제한한다.
- **ActivityPub profile은 Node 직접 조회까지만 연다.** 저장된 ActivityPub profile은 GraphQL `Profile` object로 읽을 수 있지만, 기존 local entry point인 handle 조회, active profile 선택, follow graph, follow/unfollow mutation은 local profile 기준을 유지한다. ActivityPub target follow/unfollow는 profile not found 오류로 닫고 ActivityPub Follow/Undo를 발송하지 않는다. ActivityPub profile의 `Profile.posts`는 빈 connection으로 응답하고 remote actor/post/collection fetch를 시도하지 않는다. 이 제한은 이번 cycle의 구현 범위를 단순화하기 위한 API surface 경계이며, ActivityPub profile 저장 모델에 별도 account/session 불변식을 새로 강제하는 목표는 아니다.
- **actor key는 lazy 생성한다.** 기존 local profile에 대한 migration-time backfill은 배포 시간을 늘리고 실패 복구 경로가 복잡하다. actor document 또는 key dispatcher가 local actor key를 필요로 할 때 ActivityPub actor row를 보장한 뒤 transaction 안에서 RSA-PKCS#1-v1.5와 Ed25519 key pair를 idempotent하게 생성한다.
- **actor document는 필수 `inbox`/`outbox` URI만 광고하고 endpoint 동작은 열지 않는다.** ActivityPub actor object는 `inbox`와 `outbox`가 필수 속성이므로 actor-scoped `/ap/actor/{profile.id}/inbox`, `/ap/actor/{profile.id}/outbox` URI를 문서에 포함한다. 다만 이번 cycle은 discovery와 read-only actor document까지이므로 해당 endpoint 요청은 404로 종료하고, `followers`, `following`, `endpoints.sharedInbox`는 구현 전까지 문서에 노출하지 않는다.
- **`Profile.relativeHandle`은 configured local 기준 표시 문자열이다.** configured local profile은 `@handle`, configured local instance가 아닌 instance의 profile은 `@handle@host`로 반환한다. 같은 `LOCAL` kind라도 현재 deployment의 configured local instance가 아니면 host를 포함한다. UI는 bare handle과 host를 조합하지 않고 이 필드를 표시 용도로 사용한다.

## Risks / Trade-offs

- **Lazy key 생성 경합** → actor key table은 ActivityPub actor/key type 단위 unique constraint를 두고, 생성은 transaction 또는 upsert로 idempotent하게 처리한다.
- **기존 profile unique 변경 migration 위험** → configured local instance row를 먼저 보장한 뒤 기존 profile에 `instance_id`를 채우고, 새 composite unique를 만든 다음 기존 전역 unique를 제거한다.
- **remote profile 조회 UX가 제한적임** → 이번 scope에서는 저장된 remote profile을 GraphQL `Profile` 읽기 대상으로 노출하되, remote UI 연결은 remote fetch 정책이 정해진 뒤 별도 change에서 다룬다.
- **remote profile에 local workflow가 붙은 것처럼 보일 수 있음** → Node 직접 조회는 허용하지만 active profile 선택은 profile not found 오류로 닫고, viewerFollow는 없음으로 응답하며, follow/unfollow mutation은 profile not found 오류로 닫아 remote Follow/delivery가 없는 거짓 관계를 만들지 않는다. `Profile.posts`도 빈 connection으로 응답해 remote post fetch가 있는 것처럼 보이지 않게 한다.
- **actor document 최소 필드가 일부 fediverse 구현에 부족할 수 있음** → ActivityPub actor 필수 `inbox`/`outbox` URI는 포함하되 discovery/read 가능성만 이번 완료 기준으로 삼고, delivery/submission/collection 동작과 followers/following/sharedInbox는 후속 구현 전까지 제공하지 않는다.
- **canonical origin 불일치** → 부트스트랩 시 `PUBLIC_ORIGIN`과 configured local instance row를 비교해 불일치를 빠르게 드러내고, request Host를 source of truth로 쓰지 않는다.

## Migration Plan

1. `instance`와 ActivityPub actor metadata/key 테이블을 추가한다.
2. configured local instance row를 canonical origin/host로 생성하거나 `PUBLIC_ORIGIN`과 일치하는 기존 local instance row를 검증한다.
3. 기존 profile row에 local instance ID를 채우고 `profile.instance_id`를 필수화한다.
4. `profile.normalized_handle` 전역 unique를 `(instance_id, normalized_handle)` unique로 교체한다.
5. key pair는 migration에서 만들지 않고 첫 actor key 요청 시 lazy 생성한다.

Rollback은 Fedify hook과 GraphQL 필드를 제거한 뒤 새 테이블/컬럼 migration을 되돌리는 방식이다. 이미 federation에 공개된 actor URI가 생긴 뒤에는 외부 캐시가 남을 수 있으므로 production rollback은 actor 공개 전 배포 단계에서 검증해야 한다.

## Open Questions

- remote actor fetch/cache, TTL, 실패 상태, 서명 검증 정책은 후속 change에서 결정한다.
- followers/following collection을 local follow graph 기반 read-only collection으로 먼저 열지, remote follow 구현과 함께 열지는 후속 change에서 결정한다.
- handle rename과 ActivityPub alias/history 정책은 federation이 실제로 활성화된 뒤 별도 product decision으로 다룬다.
