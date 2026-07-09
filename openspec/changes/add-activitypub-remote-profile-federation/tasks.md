## 1. Data Model and Migrations

- [x] 1.1 `Profile.origin` GraphQL enum에 필요한 core/API enum 경계를 정리하고 `Profile`의 origin을 instance kind에서 계산하거나 안정적으로 제공하는 방식을 구현한다.
- [x] 1.2 `activitypub_actor`에 remote actor refresh에 필요한 `last_fetched_at`과 remote actor source metadata를 추가한다.
- [x] 1.3 remote actor key fetch/verification은 Fedify에 맡기고, 이번 change에서 remote public key 저장 요구사항을 추가하지 않도록 actor key 저장 경계를 정렬한다.
- [x] 1.4 actor URI unique와 `(instance_id, normalized_handle)` 충돌 정책에 필요한 index/constraint를 정렬한다.
- [x] 1.5 remote profile materialization의 Fedify lookup 전에 normalized domain의 ActivityPub instance를 find-or-create하고, suspended 또는 unresponsive instance는 lookup 없이 저장/refresh를 거부하도록 데이터 접근 경계를 구현한다.
- [ ] 1.6 새 테이블/컬럼/enum의 `TableDiscriminator`, Drizzle table exports, relations v2 schema, migration fixture를 갱신한다.

## 2. Remote Actor Materialization

- [x] 2.1 federated handle parser를 구현해 bare local handle, `@handle`, `handle@domain`, `@handle@domain` 입력을 configured local 또는 remote handle 형태로 분류하고, configured local domain의 `handle@domain`/`@handle@domain`은 local handle로 처리한다.
- [x] 2.2 `packages/fedify`에 Fedify lookup API를 사용하는 remote actor materialization adapter를 구현하고 수동 WebFinger/JSON-LD fetcher를 만들지 않는다.
- [ ] 2.3 Fedify lookup/dereference 설정 surface로 HTTP safety, timeout, 응답 크기 제한을 적용하고 별도 content-type/redirect/SSRF 검증 로직을 중복 구현하지 않는다.
- [x] 2.4 actor URI unique와 `(instance_id, normalized_handle)` 충돌 정책을 적용해 기존 remote `Profile` 갱신 또는 새 `Profile` 생성을 idempotent하게 처리하되, local actor URI 재사용은 identity 충돌로 거부한다.
- [x] 2.5 actor `preferredUsername`, `name`, `summary`, `published`, follower 승인 필요 속성을 `Profile` 필드와 follow policy로 projection하되, `preferredUsername`은 요청 handle과 normalized 값이 일치하고 기존 `Profile.handle` 스키마를 통과해야 하며 `name`은 기존 `Profile.displayName` 스키마를 통과할 때만 사용하고 `published` 누락 시 `created_at` fallback은 최초 저장에만 적용하고 refresh에서는 기존 `created_at`을 보존한다.
- [x] 2.6 actor materialization 성공 시 `last_fetched_at`을 갱신하고, 7일 TTL을 넘은 actor는 저장된 active profile을 먼저 반환하면서 비동기 refresh를 예약/수행하되 `UNRESPONSIVE` instance에서는 refresh를 예약하지 않도록 구현한다.
- [x] 2.7 suspended instance의 actor materialization, actor refresh, Profile object 노출을 차단한다.

## 3. GraphQL Profile API

- [x] 3.1 `Profile.origin` enum을 GraphQL schema에 노출하고 `Profile.relativeHandle`과 함께 local/remote 표시 계약을 갱신한다.
- [x] 3.2 `profileByHandle(handle:)`가 bare local handle, configured local domain의 `handle@domain`/`@handle@domain`, 저장된 remote `handle@domain`/`@handle@domain`을 모두 kosmo DB에서만 조회하고 WebFinger/actor fetch/write를 수행하지 않도록 확장한다.
- [x] 3.3 Node ID 기반 `Profile` loader가 local profile과 active remote profile을 반환하되 suspended instance profile은 노출하지 않도록 접근 조건을 정렬한다.
- [x] 3.4 active profile selection은 configured local profile만 허용하고 remote profile 선택은 profile not found로 유지한다.
- [x] 3.5 local profile creation의 duplicate handle 검증을 configured local instance 범위로 제한하고, 다른 ActivityPub instance의 동일 normalized handle은 local 생성 conflict로 취급하지 않도록 정렬한다.

## 4. Verification

- [x] 4.1 GraphQL schema를 재생성하고 `Profile.origin`, DB-only `profileByHandle`, remote Node 조회 계약이 반영되는지 확인한다.
- [ ] 4.2 remote actor materialization unit/integration test로 Fedify lookup 성공, lookup 실패, non-actor lookup 실패, requested handle과 actor `preferredUsername` mismatch 거부, existing remote actor URI 재사용, local actor URI collision 거부, handle collision 실패, remote instance find-or-create, unsupported `preferredUsername` 거부, unsupported `name`의 displayName fallback, stale actor의 active profile 선반환과 비동기 refresh 예약, `UNRESPONSIVE` refresh 미예약, suspended/unresponsive instance에서 lookup 미수행과 저장/refresh 차단을 검증한다.
- [ ] 4.3 GraphQL profile test로 DB-only local/federated `profileByHandle`, configured local domain의 `handle@domain`/`@handle@domain` local lookup, remote `handle@domain`/`@handle@domain` lookup, `Profile.origin`, remote Node 조회, active profile selection remote 거부, remote-only duplicate handle의 local profile creation 허용, remote target follow/unfollow profile not found, remote target viewerFollow 없음 응답, remote followers/following connection 빈 결과와 0 count를 검증한다.
- [x] 4.4 web profile list/search 결과, profile page, profile page 하위 링크와 팔로우 카운트 링크가 remote profile 링크를 `/${relativeHandle}` path로 만들고 route parameter는 `handle@domain`으로 전달되는지, remote follow 지원 전까지 local follow action을 숨기거나 비활성화하는지 검증한다.
- [ ] 4.5 `pnpm lint:eslint`, 관련 package typecheck/test, GraphQL schema check, DB migration/schema check, `openspec validate add-activitypub-remote-profile-federation --strict`를 실행한다.
