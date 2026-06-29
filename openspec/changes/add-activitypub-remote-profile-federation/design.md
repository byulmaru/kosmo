## Context

`add-activitypub-actor-discovery`는 local profile을 WebFinger와 actor document로 공개하는 read-only federation 경계를 만든다. 그 변경은 remote profile을 `Profile` 저장 모델에 올릴 수 있는 토대를 마련하지만, 기존 `profileByHandle`, follow/unfollow, `Profile.posts`는 local-only로 닫아 둔다.

이번 변경은 첫 번째 후속 단계로, remote ActivityPub actor를 기존 `Profile` row로 materialize하고 GraphQL에서 active remote profile을 읽을 수 있게 한다. follow, inbox activity, remote posts는 별도 changes에서 다룬다.

## Goals / Non-Goals

**Goals:**

- `profileByHandle(handle:)`가 bare local handle과 저장된 federated handle을 모두 받아 kosmo DB에서만 `Profile`을 조회하게 한다.
- remote actor materialization은 공개 GraphQL API가 아니라 federation 내부 service로 제공한다.
- remote actor lookup과 ActivityPub object parsing은 Fedify WebFinger/object lookup과 typed vocabulary API를 사용한다.
- remote actor URI를 ActivityPub identity의 canonical key로 사용하고, kosmo 내부 identity는 `Profile.id`를 계속 사용한다.
- remote actor를 기존 `Profile` 필드로 projection하고, `Profile.origin` enum으로 local/remote를 구분한다.
- remote actor refresh timestamp와 suspended instance 차단 정책을 정의한다.

**Non-Goals:**

- remote follow/unfollow, inbound Follow/Accept/Reject/Undo 처리.
- remote outbox/Note ingestion, remote `Profile.posts` 확장, home timeline에 remote posts 포함.
- actor URI 직접 입력만으로 remote profile 저장.
- dedicated background worker/queue 기반 refresh 최적화.
- remote media file proxy, thumbnail 처리, image cache materialization.
- `viewerCanFollow` 같은 capability field 도입.

## Decisions

- **remote actor는 `Profile`로 materialize한다.** 별도 `RemoteProfile` GraphQL 타입을 만들지 않는다. local/remote 차이는 `Profile.origin`, 소속 `instance`, `activitypub_actor` metadata, resolver 정책으로 표현한다.
- **`Profile.origin` enum을 노출한다.** `relativeHandle`은 표시 문자열이지 origin 판별 API가 아니다. 클라이언트가 local/ActivityPub 여부를 알아야 하는 경우 `Profile.origin`을 사용한다. enum 값은 우선 `LOCAL`, `ACTIVITYPUB`로 둔다.
- **`profileByHandle`은 DB-only query로 유지한다.** bare handle 또는 configured local domain handle은 configured local instance에서 조회하고, `handle@domain`, `@handle@domain`, 또는 동등한 federated handle은 저장된 remote `Profile`을 `(instance.domain, profile.normalizedHandle)` 기준으로 조회한다. 이 query는 WebFinger, actor document fetch, refresh, DB materialization을 수행하지 않는다.
- **remote actor fetch/write는 federation 내부 service로 분리한다.** remote actor를 처음 만들거나 갱신해야 하는 federation 내부 흐름에서만 Fedify의 WebFinger/object lookup API로 `acct:handle@domain`을 해석한다. 일반 GraphQL 조회는 외부 I/O와 DB write를 수행하지 않는다.
- **Fedify의 protocol primitive를 재사용한다.** remote actor lookup, JSON-LD dereferencing, ActivityPub object parsing, HTTP safety는 Fedify API와 설정을 사용한다. kosmo는 Fedify가 반환한 typed actor를 `Profile`로 투영하고 actor URI uniqueness, instance state, refresh timestamp 같은 제품 정책만 구현한다.
- **WebFinger 없는 actor URI 저장은 허용하지 않는다.** actor URI 직접 입력만으로 저장하면 `acct:` identity와 handle/domain 신뢰도가 약해진다. remote profile materialization은 federated handle lookup에서 얻은 Fedify actor 객체의 canonical actor URI를 기준으로만 수행한다.
- **remote instance를 먼저 보장한다.** remote profile materialization은 federated handle의 normalized domain으로 ActivityPub `instance` row를 find-or-create한 뒤 진행한다. 기존 instance가 `SUSPENDED`이면 새 `Profile`을 만들거나 기존 profile을 refresh하지 않고 실패 처리한다.
- **actor URI가 같으면 같은 profile이다.** `activitypub_actor.uri`는 unique이며, 기존 row가 있으면 해당 `Profile`을 갱신한다. 같은 `(instance_id, normalized_handle)`에 다른 actor URI가 이미 있으면 identity 충돌로 처리해 저장하지 않는다.
- **remote actor 필드는 기존 profile 필드에 투영한다.** actor `preferredUsername`은 기존 `Profile.handle` 스키마를 만족해야 하며, 통과한 값만 `Profile.handle`과 `Profile.normalizedHandle`로 저장한다. actor `name`은 `Profile.displayName`, actor `summary`는 `Profile.bio`, actor `published`는 `Profile.createdAt`에 저장한다. actor `published`가 없을 때 현재 시각을 `createdAt`으로 쓰는 fallback은 최초 저장 시에만 적용하고, refresh에서는 기존 `createdAt`을 보존한다. `relativeHandle`은 DB에 저장하지 않고 configured local instance 기준으로 계산한다.
- **remote follow policy는 actor projection에서만 저장한다.** actor가 follower 승인 필요 속성을 제공하면 `Profile.followPolicy = APPROVAL_REQUIRED`, 그렇지 않으면 `OPEN`으로 저장한다. 이 change에서는 저장만 하고 remote follow 동작은 열지 않는다.
- **stale actor는 7일 기준으로 비동기 refresh한다.** `ActivityPubActor.lastFetchedAt`이 없거나 7일을 넘더라도 저장된 active profile 참조는 refresh 완료를 기다리지 않는다. federation 내부 materialization 경로는 기존 active profile을 반환하고 refresh를 비동기적으로 예약/수행한다. `profileByHandle`과 Node load는 DB-only로 유지한다. refresh 실패 시 기존 active profile은 stale 상태로 계속 반환할 수 있다. 실패한 resolve에 대한 negative cache는 두지 않는다.
- **suspended instance는 GraphQL profile 노출도 막는다.** `InstanceState.SUSPENDED`는 운영 정책상 federation 차단이므로 해당 instance의 profile Node 조회, DB handle 조회 결과 노출, actor materialization을 막는다. `UNRESPONSIVE`는 이미 저장된 stale profile 조회는 허용하지만 outbound federation을 억제하므로 actor refresh를 예약/수행하지 않는다.
- **web 링크는 remote profile을 federated handle로 이동시킨다.** 저장된 remote profile을 검색 결과나 profile list에서 보여줄 때 bare `handle` 기반 `/@handle` URL을 만들지 않고 `relativeHandle`/`origin`을 사용해 route parameter가 `handle@domain`으로 전달되는 federated handle URL로 연결한다. remote follow 동작은 후속 change 전까지 노출하지 않거나 비활성화한다.

## Risks / Trade-offs

- **미저장 remote profile을 사용자가 직접 검색할 entry point가 없음** → 이번 변경에서는 `profileByHandle`을 저장된 profile 조회로 제한하고, 미저장 remote actor discovery UX/API는 후속 제품 결정으로 남긴다.
- **identity 충돌 처리 실패 시 profile 병합 오류 가능** → actor URI unique와 `(instance_id, normalized_handle)` unique를 적용하고, Fedify lookup 결과의 canonical actor URI를 기준으로 저장한다.
- **stale refresh가 참조 경로를 불필요하게 지연시킬 수 있음** → 저장된 active profile은 먼저 반환하고 refresh는 federation 내부 materialization 경로에서 비동기로 예약/수행한다. 일반 GraphQL 조회에서는 refresh하지 않는다.
- **후속 follow/post 기능이 이 foundation에 의존함** → 이번 change는 remote profile 저장/조회 계약을 작게 완료하고, follow/post changes에서 필요한 추가 metadata를 별도로 추가한다.

## Migration Plan

1. 기존 `add-activitypub-actor-discovery`의 `instance`, `profile.instance_id`, `activitypub_actor`, local actor key dispatch 저장 경계를 전제로 한다.
2. `Profile.origin` enum을 GraphQL에 추가하고 instance kind에서 계산하거나 profile 저장 값으로 제공하는 방식을 구현한다.
3. `activitypub_actor.last_fetched_at`과 remote actor source fields를 추가한다.
4. 기존 저장 remote profile이 있다면 actor `last_fetched_at`은 null로 두어 첫 federation 내부 materialization에서 비동기 refresh 대상으로 판단되게 한다.

Rollback은 새 GraphQL 필드와 remote actor materialization 경로를 닫은 뒤, 새 metadata 컬럼을 되돌린다. 이미 remote actor/profile row가 생긴 뒤에는 local user data와 섞이지 않도록 `origin = ACTIVITYPUB` 또는 `instance.kind = ACTIVITYPUB` 기준으로 정리해야 한다.

## Open Questions

- remote actor type별 표시 정책은 구현 중 Fedify가 제공하는 actor type 정보를 확인해 `Profile`로 안전하게 투영 가능한 범위를 정한다.
- 미저장 remote actor를 사용자 검색 UI에서 언제/어떻게 발견하게 할지는 후속 제품 결정으로 남긴다.
