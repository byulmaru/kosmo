## 1. Workspace and Dependencies

- [ ] 1.1 `packages/fedify` workspace package를 만들고 `@kosmo/core`를 참조하도록 package/tsconfig/export 경계를 구성한다.
- [ ] 1.2 `pnpm` CLI로 `packages/fedify`에 `@fedify/fedify`와 필요한 vocab/runtime dependency를 추가한다.
- [ ] 1.3 `pnpm` CLI로 `apps/web`에 `@kosmo/fedify`와 SvelteKit hook adapter에 필요한 `@fedify/sveltekit` dependency를 추가한다.
- [ ] 1.4 `packages/fedify`가 federation request 판별, federation instance 또는 hook factory, actor dispatcher, WebFinger handle mapper/JRD 응답 조립, key pair dispatcher를 export할 수 있는 모듈 구조를 만든다.

## 2. Data Model

- [ ] 2.1 `InstanceType` 또는 동등한 enum과 `instance` 테이블을 추가해 local/remote instance domain, canonical origin, 생성/수정 시각을 저장한다.
- [ ] 2.2 `profile.instance_id`를 추가하고 기존 profile을 local instance에 연결하는 migration 흐름을 구현한다.
- [ ] 2.3 `profile.normalized_handle` 전역 unique를 `(instance_id, normalized_handle)` unique로 교체하고 관련 index/relation을 갱신한다.
- [ ] 2.4 ActivityPub actor metadata 테이블을 추가해 profile과 actor URI/type을 저장한다.
- [ ] 2.5 ActivityPub actor key 테이블을 추가해 ActivityPub actor/key type별 public/private JWK를 저장하고 `(activitypub_actor_id, key_type)` 중복을 막는다.
- [ ] 2.6 새 테이블의 `TableDiscriminator`, Drizzle relations, schema exports, OpenSpec data-model 계약과 일치하는 테스트 fixture를 갱신한다.

## 3. Profile GraphQL Contract

- [ ] 3.1 `Profile.relativeHandle` 필드를 추가해 local profile은 `@handle`, remote profile은 `@handle@domain`을 반환한다.
- [ ] 3.2 `profileByHandle(handle:)`가 local instance의 active profile만 조회하고 remote profile을 반환하지 않도록 유지/보강한다.
- [ ] 3.3 Node ID 기반 `Profile` load가 active local profile과 저장된 active remote profile을 직접 조회할 수 있게 접근 정책을 정렬한다.
- [ ] 3.4 GraphQL schema를 재생성하고 `Profile.relativeHandle`이 `apps/api/schema.graphql`에 반영되는지 확인한다.

## 4. Fedify Actor Discovery

- [ ] 4.1 API와 Fedify package가 공유할 수 있는 local instance lookup/bootstrap helper를 만들고, local instance row를 canonical origin/domain source of truth로 읽어 `PUBLIC_ORIGIN`과 검증한다.
- [ ] 4.2 WebFinger `acct:{handle}@{localDomain}`을 local active profile UUID actor identifier로 매핑한다.
- [ ] 4.3 actor dispatcher를 `/ap/actor/{identifier}` URI template에 연결하고 identifier를 raw `profile.id` UUID로 해석한다.
- [ ] 4.4 actor document를 `Person`으로 구성하고 `id`, `preferredUsername`, `name`, `summary`, `url`, `published`, `inbox`, `outbox`, `publicKey`, `assertionMethods`를 보장한다.
- [ ] 4.5 WebFinger와 actor document의 성공 content type, canonical subject/id, 404 실패 응답을 구현한다.
- [ ] 4.6 local ActivityPub actor row와 actor key가 없을 때 RSA-PKCS#1-v1.5와 Ed25519 key pair를 transaction/upsert로 lazy 생성하고 재요청 시 재사용한다.
- [ ] 4.7 actor document에 actor-scoped `inbox`, `outbox` URI를 포함하고 `followers`, `following`, `endpoints.sharedInbox`는 포함하지 않으며, 미지원 federation endpoint가 404로 종료되도록 테스트한다.

## 5. Web Integration

- [ ] 5.1 `apps/web/src/hooks.server.ts`에서 `packages/fedify`가 제공하는 federation instance 또는 hook factory를 SvelteKit `handle`에 연결하고, web hook 본문에는 ActivityPub parsing/응답 조립 로직을 두지 않는다.
- [ ] 5.2 ActivityPub/WebFinger 요청은 `packages/fedify`가 처리하고 기존 `/health`, `/graphql`, `/login`, `/@{handle}` 요청은 기존 동작을 유지하는지 확인한다.
- [ ] 5.3 actor URI와 WebFinger JRD가 canonical local origin을 사용하고 request Host에 의존하지 않는지 확인한다.

## 6. Verification

- [ ] 6.1 DB migration/push 또는 schema check로 `instance`, profile instance 관계, actor metadata/key 테이블이 생성되는지 확인한다.
- [ ] 6.2 WebFinger 성공/404, actor document 성공/404와 필수 `inbox`/`outbox` URI, unsupported endpoint 404, lazy key idempotency를 unit/integration test로 검증한다.
- [ ] 6.3 GraphQL 테스트로 `relativeHandle` local/remote 표시, remote profile 조회, `profileByHandle` local-only 동작을 검증한다.
- [ ] 6.4 `pnpm lint:eslint`, `pnpm --filter @kosmo/fedify lint:tsc`, `pnpm --filter @kosmo/web check`, 관련 package test, `openspec validate add-activitypub-actor-discovery --strict`를 실행해 변경을 검증한다.
