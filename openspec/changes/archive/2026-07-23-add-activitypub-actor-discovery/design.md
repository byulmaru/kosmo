## Context

kosmo의 공개 웹 origin은 `/@{handle}` 프로필 페이지, `/graphql` proxy와 Hono BFF를 제공한다. API 서버는 Hono/GraphQL을 별도 origin에서 실행하고, 브라우저 클라이언트는 웹 서버를 통해 API로 요청을 전달한다. ActivityPub discovery는 외부 fediverse 서버가 접근하는 HTTP surface이므로 API origin이 아니라 canonical 웹 origin에서 제공해야 한다.

Fedify는 actor dispatcher, WebFinger 처리, federation request routing을 federation instance와 `fetch` 흐름 안에 묶어 제공한다. `apps/web`은 Hono middleware에서 모든 요청을 federation에 먼저 전달하고 Fedify가 제공하는 fallback callback에서만 일반 BFF route를 실행한다. actor 조회, actor document assembly, handle mapping dispatcher, key dispatch와 inbox listener 등록은 `packages/fedify`가 소유하고, request 판별과 HTTP 응답 조립은 Fedify 공식 API에 맡긴다.

## Goals / Non-Goals

**Goals:**

- 외부 서버가 `acct:{handle}@{localDomain}` WebFinger 조회로 local active profile의 actor URI를 발견할 수 있게 한다.
- local actor URI를 `{localOrigin}/ap/actor/{profile.id}`로 고정하고, `profile.id` raw DB UUID를 ActivityPub actor identifier로 사용한다.
- local actor document가 프로필 표시 정보, ActivityPub actor 필수 `inbox`/`outbox`, `endpoints.sharedInbox`, 공개 key를 담은 `Person` 문서를 반환하게 한다.
- actor-scoped/shared inbox를 activity-neutral Fedify listener로 열고 activity별 검증과 side effect를 담당 capability에 위임한다.
- `instance`와 ActivityPub profile 저장 경계를 잡아 이후 remote fetch/follow/delivery가 같은 모델 위에서 확장될 수 있게 한다.
- 표시용 handle 정책을 configured local instance 기준 `Profile.relativeHandle` 서버 필드로 모아 UI별 문자열 조합을 피한다.

**Non-Goals:**

- Follow·Create 등 개별 inbox activity의 검증, 저장, domain side effect와 outbound delivery 조건.
- outbox submission/collection, followers/following collection 제공.
- remote actor fetch/cache 동작, TTL, retry, signature verification 정책 구현.
- handle rename, 이전 handle alias/history, WebFinger redirect.
- 저장 remote profile GraphQL/UI, active profile 선택, remote follow와 remote Post ingestion의 기존 runtime·delta 변경.
- Follow·Create 등 개별 ActivityPub activity의 protocol/domain 계약 재정의.

## Decisions

- **ActivityPub surface는 웹 origin에 둔다.** actor URI와 WebFinger subject는 외부 서버가 보는 공개 identity이므로 `PUBLIC_API_ORIGIN`이 아니라 canonical 웹 origin을 사용한다. 대안인 API origin 노출은 브라우저 API transport와 federation identity가 갈라지고, API 서버 배포 topology가 공개 actor URI에 새겨지는 문제가 있어 배제한다.
- **federation protocol 처리는 일반 Hono BFF route보다 먼저 수행하고, federation 구성은 `packages/fedify`가 소유한다.** 현재 구현은 Fedify의 `fetch`와 fallback callback을 사용하지만 이 API 이름은 durable contract가 아니다. actor assembly, handle mapping, key dispatch와 inbox listener 등록은 package로 분리해 web middleware 본문에 ActivityPub parsing/응답 조립을 넣지 않는다. root federation singleton은 임시 `MemoryKvStore`로 생성하고 production durable KV store 선택은 후속 구현에서 교체한다.
- **actor URI는 `/ap/actor/{profile.id}`와 raw DB UUID를 쓴다.** `/@{handle}`를 actor URI로 겸용하면 HTML route와 content negotiation이 강하게 결합되고, handle rename 가능성을 닫는다. Relay global ID는 GraphQL API 표현이므로 ActivityPub URI에 쓰지 않는다.
- **WebFinger handle과 actor identifier를 분리한다.** WebFinger username은 local `profile.handle`이고, actor identifier는 `profile.id`다. Fedify handle mapper는 `acct:{handle}@{domain}`을 local active profile UUID로 매핑한다.
- **WebFinger resource 해석은 federation protocol library의 표준 동작을 따른다.** canonical `acct:` resource와 canonical actor URI를 모두 발견하고, actor URI resource의 JRD subject는 요청한 actor URI를 유지한다. resource가 없거나 URL로 해석할 수 없으면 400, unknown/non-local resource이면 404를 반환한다.
- **configured local instance row가 canonical origin/domain의 source of truth다.** `localOrigin`은 `PUBLIC_ORIGIN`과 일치하는 configured local instance의 `canonical_origin`이며 actor URI, WebFinger self link, profile-page link, key ID 같은 local absolute URL을 만들 때만 사용한다. `localDomain`은 WebFinger subject와 `Profile.relativeHandle`에 쓰는 federation identity domain이다. 요청 URL origin, Host header, `PUBLIC_API_ORIGIN`을 따라 actor URI를 만들면 동일 프로필의 federated identity가 흔들린다. `PUBLIC_ORIGIN`은 local instance row를 만들거나 현재 deployment가 사용할 local instance row를 검증하는 입력으로만 사용한다. 서로 다른 domain의 `LOCAL` rows는 이후 multi-local-instance 확장을 위해 허용할 수 있지만, 현재 deployment의 federation identity는 `PUBLIC_ORIGIN`에 매칭되는 row 하나에서 결정한다. `packages/core`는 setup/migration에서 local instance row를 생성하거나 검증하는 bootstrap helper와, runtime에서 row를 새로 만들지 않고 읽기/검증만 수행하는 resolve helper를 분리해 소유한다. `packages/fedify`와 `apps/api`는 runtime resolve helper를 공유한다.
- **profile은 local/ActivityPub 공통 social identity로 확장한다.** remote ActivityPub media 설계에서 remote actor/profile identity를 `Profile`이 표현한다는 기존 방향과 맞춘다. handle uniqueness는 전역이 아니라 `(instance_id, normalized_handle)`로 제한한다.
- **GraphQL과 remote federation 행동은 후속 capability의 active 계약을 유지한다.** 이 change는 `Profile.relativeHandle`의 configured local/non-configured instance 표시 경계만 active profile spec에 추가한다. 저장 remote profile 조회, active profile 선택, follow/unfollow, Post read/materialization과 inbox activity side effect는 이후 archive되거나 active인 각 capability가 소유하며, actor-discovery archive가 과거 local-only 가정으로 되돌리지 않는다.
- **actor key는 lazy 생성한다.** 기존 local profile에 대한 migration-time backfill은 배포 시간을 늘리고 실패 복구 경로가 복잡하다. actor document 또는 key dispatcher가 local actor key를 필요로 할 때 ActivityPub actor row를 보장한 뒤 transaction 안에서 RSA-PKCS#1-v1.5와 Ed25519 key pair를 idempotent하게 생성한다.
- **actor document는 personal/shared inbox를 광고하고 inbox transport만 공통 경계로 연다.** ActivityPub actor object의 `inbox`와 `outbox`, shared inbox discovery를 위한 `endpoints.sharedInbox`를 포함한다. actor-scoped `/ap/actor/{profile.id}/inbox`와 shared `/inbox`는 federation listener가 처리하지만, activity별 validation과 side effect는 각 capability가 소유한다. outbox와 followers/following collection 동작은 별도 capability가 열기 전까지 이 change가 정의하지 않는다.
- **`Profile.relativeHandle`은 configured local 기준 표시 문자열이다.** configured local profile은 `@handle`, configured local instance가 아닌 instance의 profile은 `@handle@domain`으로 반환한다. 같은 `LOCAL` kind라도 현재 deployment의 configured local instance가 아니면 domain을 포함한다. UI는 bare handle과 domain을 조합하지 않고 이 필드를 표시 용도로 사용한다.

## Risks / Trade-offs

- **Lazy key 생성 경합** → actor key table은 ActivityPub actor/key kind 단위 unique constraint를 두고, 생성은 transaction 또는 upsert로 idempotent하게 처리한다.
- **기존 profile unique 변경 migration 위험** → configured local instance row를 먼저 보장한 뒤 기존 profile에 `instance_id`를 채우고, 새 composite unique를 만든 다음 기존 전역 unique를 제거한다.
- **remote profile/follow/Post 계약과 소유권 혼동** → 해당 current active specs와 runtime은 후속 capability 소유로 유지하고, actor-discovery delta에는 `relativeHandle` 추가만 남긴다.
- **후속 capability 계약을 오래된 delta가 덮어쓸 수 있음** → profile delta는 `Profile.relativeHandle` 추가만 남기고, data-model의 기존 profile requirement와 post delta는 current active spec을 유지하도록 actor-discovery sync 대상에서 제거한다.
- **actor document와 inbox route가 activity 지원 범위를 과장할 수 있음** → actor document는 personal/shared inbox를 광고하되 discovery change는 activity allowlist나 side effect를 정의하지 않는다. 등록 handler가 있는 activity만 해당 capability 계약에 따라 처리하고, outbox와 followers/following collection 동작은 이 change가 정의하지 않는다.
- **canonical origin 불일치** → 부트스트랩 시 `PUBLIC_ORIGIN`과 configured local instance row를 비교해 불일치를 빠르게 드러내고, request Host를 source of truth로 쓰지 않는다.

## Migration Plan

1. `instance`와 ActivityPub actor metadata/key 테이블을 추가한다.
2. configured local instance row를 canonical origin/domain으로 생성하거나 `PUBLIC_ORIGIN`과 일치하는 기존 local instance row를 검증한다.
3. 기존 profile row에 local instance ID를 채우고 `profile.instance_id`를 필수화한다.
4. `profile.normalized_handle` 전역 unique를 `(instance_id, normalized_handle)` unique로 교체한다.
5. key pair는 migration에서 만들지 않고 첫 actor key 요청 시 lazy 생성한다.

Rollback은 Hono의 federation 전달과 GraphQL 필드를 제거한 뒤 새 테이블/컬럼 migration을 되돌리는 방식이다. 이미 federation에 공개된 actor URI가 생긴 뒤에는 외부 캐시가 남을 수 있으므로 production rollback은 actor 공개 전 배포 단계에서 검증해야 한다.

## Open Questions

- remote actor fetch/cache와 서명 검증은 `activitypub-remote-profile-federation` 및 관련 protocol capability가 소유한다.
- followers/following collection을 local follow graph 기반 read-only collection으로 먼저 열지, remote follow 구현과 함께 열지는 후속 change에서 결정한다.
- handle rename과 ActivityPub alias/history 정책은 federation이 실제로 활성화된 뒤 별도 product decision으로 다룬다.
