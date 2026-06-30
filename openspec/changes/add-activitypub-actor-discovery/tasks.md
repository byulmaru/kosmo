## 1. Workspace and Dependencies

- [x] 1.1 `packages/fedify` workspace package를 만들고 `@kosmo/core`를 참조하도록 package/tsconfig/export 경계를 구성한다.
- [x] 1.2 `pnpm` CLI로 `packages/fedify`에 `@fedify/fedify`와 필요한 vocab/runtime dependency를 추가한다.
- [x] 1.3 `pnpm` CLI로 `apps/web`에 `@kosmo/fedify`와 SvelteKit hook adapter에 필요한 `@fedify/sveltekit` dependency를 추가한다.
- [x] 1.4 `packages/fedify`가 임시 `MemoryKvStore` 기반 Fedify root federation singleton을 export할 수 있는 모듈 구조를 만든다.

## 2. Data Model

- [x] 2.1 `InstanceKind` 또는 동등한 enum과 `instance` 테이블을 추가해 domain, state, local instance의 canonical origin, ActivityPub instance의 선택적 canonical origin, 생성/수정 시각을 저장하고, domain 중복은 막되 `LOCAL` row 단일성은 강제하지 않는다.
- [x] 2.2 `profile.instance_id`를 추가하고 local instance bootstrap 이후 기존 profile을 configured local instance에 연결해 handle을 보존하는 migration 흐름을 구현한다.
- [x] 2.3 `profile.normalized_handle` 전역 unique를 `(instance_id, normalized_handle)` unique로 교체하고 관련 index/relation을 갱신한다.
- [x] 2.4 ActivityPub actor metadata 테이블을 추가해 profile과 actor URI/type을 저장하고, actor URI 중복과 profile당 actor metadata 중복을 막는다.
- [x] 2.5 ActivityPub actor key 테이블을 추가해 local actor의 public/private JWK와 remote actor의 선택적 public key metadata를 저장할 수 있게 하고 `(activitypub_actor_id, kind)` 중복을 막는다.
- [x] 2.6 새 테이블의 `TableDiscriminator`, Drizzle relations, schema exports, OpenSpec data-model 계약과 일치하는 테스트 fixture를 갱신한다.

## 3. Profile GraphQL Contract

- [x] 3.1 `Profile.relativeHandle` 필드를 추가해 현재 local-only profile 모델에서는 `@handle`을 반환한다.
- [ ] 3.1a `profile.instance_id`와 instance-scoped handle uniqueness 도입 이후 configured local instance가 아닌 instance의 profile은 `@handle@domain`을 반환하도록 확장한다.
- [x] 3.2 `profileByHandle(handle:)`가 configured local instance의 active profile만 조회하고 remote profile을 반환하지 않도록 유지/보강한다.
- [ ] 3.3 Node ID 기반 `Profile` load가 active local profile과 저장된 active remote profile을 직접 조회할 수 있게 접근 정책을 정렬한다.
- [ ] 3.4 `profileByHandle`, active profile selection, follow graph, follow/unfollow mutation, viewerFollow, `Profile.posts`가 remote profile로 확장되지 않고 local profile 기준으로 동작하는지 구현한다.
- [x] 3.5 local profile 생성 resolver가 core runtime local instance resolve helper로 configured local instance ID를 결정하고, local instance 설정 누락/불일치를 설정 오류로 처리하게 한다.
- [x] 3.6 GraphQL schema를 재생성하고 `Profile.relativeHandle`이 `apps/api/schema.graphql`에 반영되는지 확인한다.

## 4. Fedify Actor Discovery

- [x] 4.1 `packages/core`에 runtime local instance resolve helper를 만들고, `PUBLIC_ORIGIN`과 일치하는 configured local instance row를 canonical origin/domain source of truth로 읽어 검증하되 runtime 요청 처리 중 row를 자동 생성하지 않는다.
- [x] 4.2 `packages/core`에 setup/migration에서 사용할 local instance bootstrap helper를 만들고, configured local instance row를 만들거나 `PUBLIC_ORIGIN`과 일치하는 기존 row를 검증하며, profile backfill 전에 실행되는 setup/migration 흐름에 연결한다.
- [ ] 4.3 WebFinger `acct:{handle}@{localDomain}`을 local active profile UUID actor identifier로 매핑한다.
- [ ] 4.4 actor dispatcher를 `/ap/actor/{identifier}` URI template에 연결하고 identifier를 raw `profile.id` UUID로 해석한다.
- [ ] 4.5 actor document를 `Person`으로 구성하고 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `publicKey`, `assertionMethods`를 보장한다.
- [ ] 4.6 WebFinger와 actor document의 성공 content type, canonical subject/id, 404 실패 응답을 구현한다.
- [ ] 4.7 local ActivityPub actor row와 actor key가 없을 때 RSA-PKCS#1-v1.5와 Ed25519 key pair를 transaction/upsert로 lazy 생성하고 재요청 시 재사용한다.
- [ ] 4.8 actor document에 actor-scoped `inbox`, `outbox` URI를 포함하고 `followers`, `following`, `endpoints.sharedInbox`는 포함하지 않으며, 미지원 federation endpoint가 404로 종료되도록 테스트한다.

## 5. Web Integration

- [x] 5.1 `apps/web/src/hooks.server.ts`에서 `packages/fedify`가 제공하는 federation 구성을 Fedify SvelteKit hook adapter로 SvelteKit `handle`에 연결하고, web hook 본문에는 ActivityPub parsing/응답 조립 로직을 두지 않는다.
- [ ] 5.2 ActivityPub/WebFinger 요청은 `packages/fedify`가 처리하고 기존 `/health`, `/graphql`, `/login`, `/@{handle}` 요청은 기존 동작을 유지하는지 확인한다.
- [ ] 5.3 actor URI와 WebFinger JRD가 canonical local origin을 사용하고 request Host에 의존하지 않는지 확인한다.

## 6. Verification

- [ ] 6.1 DB migration/push 또는 schema check와 migration fixture로 `instance`, profile instance 관계, actor metadata/key 테이블이 생성되고, bootstrap 이후 기존 profile의 `instance_id`가 configured local instance로 채워지며 handle이 보존되는지, `instance.domain` 중복 금지, 서로 다른 domain의 복수 `LOCAL` row 허용, actor URI 중복 금지, profile당 actor metadata 중복 금지, actor별 key kind 중복 금지, remote actor public key metadata를 private key 없이 저장할 수 있는지, `(instance_id, normalized_handle)` unique가 같은 instance 중복은 막고 다른 instance 동일 handle은 허용하는지 확인한다.
- [ ] 6.2 local instance bootstrap helper가 configured local instance row를 생성하거나 기존 row를 검증하는 positive path, runtime local instance resolve가 configured local instance row를 읽어 검증하되 row가 없을 때 bootstrap/자동 생성을 하지 않고 설정 오류로 처리하는지, local profile 생성이 configured local instance ID를 저장하고 설정 누락/불일치를 설정 오류로 처리하는지 unit/integration test로 검증한다.
- [ ] 6.3 WebFinger 성공/404, WebFinger `application/jrd+json` content type, canonical subject, self/profile-page links, actor document 성공/404, actor document `application/activity+json` content type, canonical `id`, `preferredUsername`, `name`, `url`, `published`, 필수 `inbox`/`outbox` URI, `publicKey`, `assertionMethods`, unsupported endpoint 404, lazy key idempotency를 unit/integration test로 검증한다.
- [ ] 6.4 GraphQL 테스트로 `relativeHandle` local 표시와 profile-instance 관계 도입 이후 configured local/non-configured local/remote 표시, remote profile Node 조회, `profileByHandle` local-only 동작, 다른 instance 동일 handle의 local profile 생성 허용과 configured local duplicate handle conflict, remote target active profile selection/follow/unfollow profile not found, remote target viewerFollow 없음 응답, remote profile `Profile.posts` 빈 connection을 검증한다.
- [ ] 6.5 dependency ownership이 `@fedify/fedify`는 `packages/fedify`, `@kosmo/fedify`와 `@fedify/sveltekit`은 `apps/web`에 들어가는지, web hook 본문에는 ActivityPub parsing/응답 조립 로직이 없는지 확인하고, `pnpm lint:eslint`, `pnpm --filter @kosmo/fedify lint:tsc`, `pnpm --filter @kosmo/web check`, 관련 package test, `openspec validate add-activitypub-actor-discovery --strict`를 실행해 변경을 검증한다.
