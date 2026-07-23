## 1. Workspace and Dependencies

- [x] 1.1 `packages/fedify` workspace package를 만들고 `@kosmo/core`를 참조하도록 package/tsconfig/export 경계를 구성한다.
- [x] 1.2 `pnpm` CLI로 `packages/fedify`에 `@fedify/fedify`와 필요한 vocab/runtime dependency를 추가한다.
- [x] 1.3 `apps/web`이 `@kosmo/fedify`를 소유하게 하고, Hono 전환 뒤 더 이상 사용하지 않는 `@fedify/sveltekit` dependency는 제거한다.
- [x] 1.4 `packages/fedify`가 임시 `MemoryKvStore` 기반 Fedify root federation singleton을 export할 수 있는 모듈 구조를 만든다.

## 2. Data Model

- [x] 2.1 `InstanceKind` 또는 동등한 enum과 `instance` 테이블을 추가해 domain, state, local instance의 canonical origin, ActivityPub instance의 선택적 canonical origin, 생성/수정 시각을 저장하고, domain 중복은 막되 `LOCAL` row 단일성은 강제하지 않는다.
- [x] 2.2 `profile.instance_id`를 추가하고 local instance bootstrap 이후 기존 profile을 configured local instance에 연결해 handle을 보존하는 migration 흐름을 구현한다.
- [x] 2.3 `profile.normalized_handle` 전역 unique를 `(instance_id, normalized_handle)` unique로 교체하고 관련 index/relation을 갱신한다.
- [x] 2.4 ActivityPub actor metadata 테이블을 추가해 profile과 actor URI/type을 저장하고, actor URI 중복과 profile당 actor metadata 중복을 막는다.
- [x] 2.5 ActivityPub actor key 테이블을 추가해 local actor의 public/private JWK와 remote actor의 선택적 public key metadata를 저장할 수 있게 하고 `(activitypub_actor_id, kind)` 중복을 막는다.
- [x] 2.6 새 테이블의 UUID primary key default, Drizzle relations, schema exports, OpenSpec data-model 계약과 일치하는 테스트 fixture를 갱신한다. 이후 PROD-366에서 신규 default는 UUIDv7으로 전환되며 기존 UUIDv8 값은 유지된다.

## 3. Profile GraphQL Contract

- [x] 3.1 `Profile.relativeHandle` 필드를 추가해 configured local profile에는 `@handle`을 반환한다.
- [x] 3.1a `profile.instance_id`와 instance-scoped handle uniqueness 도입 이후 configured local instance가 아닌 instance의 profile은 `@handle@domain`을 반환하도록 확장한다.
- [x] 3.2 `profileByHandle(handle:)`의 local/DB-known remote 조회 동작은 이후 remote-profile capability의 active 계약을 유지하고 actor-discovery delta가 과거 local-only 요구사항으로 덮어쓰지 않게 한다.
- [x] 3.3 Node ID 기반 `Profile` load의 local/remote 접근 정책은 이후 remote-profile capability의 active 계약을 유지한다.
- [x] 3.4 follow graph, remote follow/unfollow와 저장된 remote Post 조회는 이후 follow/post capability의 active 계약을 유지하고 actor-discovery delta에서 재정의하지 않는다.
- [x] 3.5 local profile 생성 resolver가 core runtime local instance resolve helper로 configured local instance ID를 결정하고, local instance 설정 누락/불일치를 설정 오류로 처리하게 한다.
- [x] 3.6 GraphQL schema를 재생성하고 `Profile.relativeHandle`이 `apps/api/schema.graphql`에 반영되는지 확인한다.

## 4. Fedify Actor Discovery

- [x] 4.1 `packages/core`에 runtime local instance resolve helper를 만들고, `PUBLIC_ORIGIN`과 일치하는 configured local instance row를 canonical origin/domain source of truth로 읽어 검증하되 runtime 요청 처리 중 row를 자동 생성하지 않는다.
- [x] 4.2 `packages/core`에 setup/migration에서 사용할 local instance bootstrap helper를 만들고, configured local instance row를 만들거나 `PUBLIC_ORIGIN`과 일치하는 기존 row를 검증하며, profile backfill 전에 실행되는 setup/migration 흐름에 연결한다.
- [x] 4.3 WebFinger `acct:{handle}@{localDomain}`을 local active profile UUID actor identifier로 매핑한다.
- [x] 4.4 actor dispatcher를 `/ap/actor/{identifier}` URI template에 연결하고 identifier를 raw `profile.id` UUID로 해석한다.
- [x] 4.5 actor document를 `Person`으로 구성하고 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `publicKey`, `assertionMethod`를 보장한다.
- [x] 4.6 WebFinger와 actor document의 성공 content type, canonical subject/id, WebFinger malformed resource 400과 unknown actor 404를 current main의 integration test로 확인한다.
- [x] 4.7 local ActivityPub actor row와 actor key가 없을 때 RSA-PKCS#1-v1.5와 Ed25519 key pair를 transaction/upsert로 lazy 생성하고 재요청 시 재사용한다.
- [x] 4.8 actor document에 actor-scoped `inbox`, `outbox`, canonical `endpoints.sharedInbox` URI를 포함하고 `followers`, `following`은 포함하지 않으며, personal/shared inbox는 federation listener로 위임되고 outbox/collection 동작은 이 capability가 소유하지 않음을 확인한다.

## 5. Web Integration

- [x] 5.1 `apps/web/src/server/app.ts`에서 federation 요청을 일반 Hono BFF route보다 먼저 처리하고, 처리되지 않은 요청은 기존 route로 이어가며 middleware 본문에는 ActivityPub parsing/응답 조립 로직을 두지 않는다.
- [x] 5.2 ActivityPub/WebFinger 요청은 `packages/fedify`가 처리하고 기존 `/health`, `/graphql`, `/login`, `/@{handle}` 및 SPA 요청은 기존 동작을 유지하는지 확인한다.
- [x] 5.3 actor URI와 WebFinger JRD가 canonical local origin을 사용하고 request Host에 의존하지 않는지 확인한다.

## 6. Verification

- [x] 6.1 DB migration/push 또는 schema check와 migration fixture로 `instance`, profile instance 관계, actor metadata/key 테이블이 생성되고, bootstrap 이후 기존 profile의 `instance_id`가 configured local instance로 채워지며 handle이 보존되는지, `instance.domain` 중복 금지, 서로 다른 domain의 복수 `LOCAL` row 허용, actor URI 중복 금지, profile당 actor metadata 중복 금지, actor별 key kind 중복 금지, remote actor public key metadata를 private key 없이 저장할 수 있는지, `(instance_id, normalized_handle)` unique가 같은 instance 중복은 막고 다른 instance 동일 handle은 허용하는지 확인한다. 이후 canonical Instance 상태 차원 확장은 이 actor-discovery archive에서 새 migration으로 흡수하지 않는다.
- [x] 6.2 local instance bootstrap helper가 configured local instance row를 생성하거나 기존 row를 검증하는 positive path, runtime local instance resolve가 configured local instance row를 읽어 검증하되 row가 없을 때 bootstrap/자동 생성을 하지 않고 설정 오류로 처리하는지, local profile 생성이 configured local instance ID를 저장하고 설정 누락/불일치를 설정 오류로 처리하는지 unit/integration test로 검증한다.
- [x] 6.3 WebFinger acct/actor URI 성공, malformed resource 400, unknown actor 404, WebFinger `application/jrd+json` content type, canonical subject, self/profile-page links, actor document 성공/404, actor document `application/activity+json` content type, canonical `id`, `preferredUsername`, `name`, `url`, `published`, 필수 `inbox`/`outbox` URI, `publicKey`, `assertionMethod`, lazy key idempotency를 unit/integration test로 검증한다.
- [x] 6.4 GraphQL 테스트로 `relativeHandle`의 configured local/non-configured local/remote 표시, remote profile Node 및 DB-only handle 조회, 다른 instance 동일 handle의 local profile 생성 허용과 configured local duplicate handle conflict, 현재 remote follow/unfollow 계약, 저장된 active remote profile Post의 일반 공개 범위를 검증한다. actor-discovery archive는 이 후속 runtime 계약을 과거 local-only delta로 되돌리지 않는다.
- [x] 6.5 dependency ownership이 `@fedify/fedify`는 `packages/fedify`, `@kosmo/fedify`는 `apps/web`에 있고 `@fedify/sveltekit`은 제거됐는지, Hono middleware 본문에는 ActivityPub parsing/응답 조립 로직이 없는지 확인한다. `pnpm lint:eslint`, `pnpm --filter @kosmo/fedify lint:tsc`, `pnpm --filter @kosmo/web check`, 관련 package test, `openspec validate add-activitypub-actor-discovery --strict`를 실행한다.
