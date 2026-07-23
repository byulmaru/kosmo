## Why

kosmo는 로컬 프로필, 게시글, 팔로우의 SNS 뼈대가 갖춰졌지만 ActivityPub에서 로컬 프로필을 어떤 actor로 발견하고 읽을 수 있는지에 대한 계약이 없다. 이번 변경은 외부 서버가 kosmo 로컬 프로필을 WebFinger로 발견하고 actor document를 역참조할 수 있는 federation identity 경계와, 이후 capability가 공통으로 재사용하는 Fedify inbox transport 경계를 확정한다.

이 change가 처음 작성된 뒤 웹 runtime은 SvelteKit에서 Hono BFF로 전환됐고, PROD-241/PR #247이 actor-scoped/shared inbox route를 activity-neutral Fedify listener로 열었다. 최종 archive는 그 current-main 상태를 기준으로 하며, Follow·Create 등 activity별 검증과 side effect는 해당 capability에 위임한다.

## Authority / Provenance

- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- PROD-175와 구현 자식 PROD-176, PROD-177, PROD-181, PROD-182, PROD-186, PROD-187, PROD-190, PROD-191, PROD-167
- Hono 전환을 확정한 `migrate-frontend-to-expo-relay` archived change
- activity-neutral inbox route와 소유권 경계를 확정한 PROD-241
- completion/archive 소유 이슈 PROD-459

## What Changes

- `apps/web` Hono BFF는 모든 요청을 Fedify `federation.fetch`에 먼저 전달하고, ActivityPub/WebFinger 처리 로직은 `packages/fedify`가 소유한다.
- WebFinger `acct:{handle}@{localDomain}` 조회가 local active profile을 actor URI `{localOrigin}/ap/actor/{profile.id}`로 연결하도록 정의한다.
- actor document는 `Person`의 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `publicKey`, `assertionMethods`를 보장한다.
- `inbox`, `outbox`는 ActivityPub actor 필수 속성으로 actor-scoped URI를 광고하고, `endpoints.sharedInbox`는 canonical shared inbox URI를 광고한다.
- actor-scoped/shared inbox 요청은 activity-neutral Fedify listener로 처리하고, activity별 검증·저장·side effect는 해당 capability에 위임한다.
- `followers`, `following`은 광고하지 않고, outbox submission/collection과 followers/following collection endpoint는 별도 capability가 열기 전까지 404를 유지한다.
- `instance`를 local/ActivityPub identity authority 공통 테이블로 추가하고, `PUBLIC_ORIGIN`과 일치하는 configured local instance row의 canonical origin/domain을 federation identity의 source of truth로 둔다.
- `profile`을 local/ActivityPub 공통 social identity로 확장하고, handle uniqueness를 instance 범위로 변경한다.
- ActivityPub actor metadata와 actor key 저장 경계를 추가한다. local actor key는 RSA-PKCS#1-v1.5와 Ed25519 key pair를 lazy 생성한다.
- GraphQL `Profile.relativeHandle`을 추가해 configured local profile은 `@handle`, 그 외 instance의 profile은 `@handle@domain`으로 표시 문자열을 서버에서 완성한다.
- 저장 remote profile 조회, active profile 선택, remote follow와 remote Post ingestion은 이후 capability가 확장한 current active 계약을 유지하고, actor-discovery archive는 해당 runtime이나 delta를 수정하지 않는다.

## Capabilities

### New Capabilities

- `activitypub-actor-discovery`: Fedify 기반 WebFinger, actor document, actor key dispatch, Hono BFF 전달, activity-neutral inbox transport와 federation 포함/제외 범위를 다룬다.

### Modified Capabilities

- `data-model`: `instance`, ActivityPub actor metadata/key 저장 경계, profile의 instance 소속과 instance-scoped handle uniqueness를 추가한다.
- `profile`: configured local instance 기준 `Profile.relativeHandle` 표시 계약을 추가한다. 저장 remote profile 조회·follow·Post 계약은 이후 capability가 소유한 current active spec을 유지한다.

## Impact

- `apps/web`: Hono middleware에서 `packages/fedify`가 제공하는 federation의 `fetch`를 먼저 호출하고, Fedify의 `onNotFound`/`onNotAcceptable` callback에서만 기존 BFF route와 SPA fallback을 이어서 처리한다.
- `packages/fedify`: Fedify root federation singleton, actor dispatcher, WebFinger handle mapping dispatcher, key pair dispatcher, ActivityPub object assembly와 actor-scoped/shared inbox listener 등록을 소유하고, federation request 처리와 HTTP 응답 조립은 Fedify `fetch` 흐름에 맡긴다. 임시 `MemoryKvStore`를 사용하며 production durable KV store 선택은 후속 구현에서 교체한다.
- `packages/core/db`: `instance`와 ActivityPub actor 관련 테이블, `profile.instance_id`, 관련 UUID primary key default, unique/index/relation이 추가된다.
- `apps/api`: GraphQL `Profile.relativeHandle`의 configured local/non-configured instance 표시 계약을 반영한다. 이후 remote profile/follow/Post capability가 확장한 current-main 계약은 이 archive에서 되돌리지 않는다.
- dependency: `packages/fedify`가 `@fedify/fedify`와 vocabulary runtime을, `apps/web`이 `@kosmo/fedify`를 소유한다. SvelteKit 전환 뒤 `@fedify/sveltekit` 의존성은 제거됐다.
- 환경/운영: configured local instance canonical origin/domain은 DB row가 source of truth이며, `PUBLIC_ORIGIN`은 초기 local instance bootstrap 입력과 runtime local instance 검증 입력으로 사용한다.
- 제외 범위: 이 archive는 Remote Follow/Create runtime이나 delta, 새 DB migration, GraphQL resolver, Web UI를 변경하지 않는다.
