## Why

kosmo는 local actor discovery 경계를 만들고 있지만, 원격 ActivityPub actor를 kosmo의 기존 `Profile` 모델로 저장하고 읽는 최소 기반은 아직 없다. 이번 변경은 follow나 remote post ingestion까지 확장하지 않고, 저장된 remote actor를 local profile과 같은 GraphQL `Profile`로 다룰 수 있는 foundation만 만든다.

## What Changes

- `profileByHandle(handle:)`는 기존 local handle과 저장된 remote `handle@domain`/`@handle@domain` 입력을 모두 지원하되, kosmo DB만 조회하고 외부 actor fetch나 저장을 수행하지 않는다.
- remote actor materialization은 공개 GraphQL API가 아니라 federation 내부 service로 제공하며, Fedify의 WebFinger/object lookup과 ActivityPub vocabulary API를 사용한다.
- remote actor identity는 ActivityPub actor URI로 구분하고, kosmo 내부 GraphQL/DB identity는 기존 `Profile.id`를 사용한다.
- actor URI 직접 입력만으로 remote profile을 저장하지 않고, federated handle lookup을 통과한 actor만 저장한다.
- remote actor는 materialization 전에 normalized domain의 ActivityPub instance를 보장하고, actor `preferredUsername`이 기존 `Profile.handle` 스키마를 만족할 때만 `Profile.handle`/`normalizedHandle`로 저장한다.
- remote actor는 actor `summary`를 `Profile.bio`, actor `published`를 `Profile.createdAt`에 반영하되, `published`가 없는 actor의 `createdAt` fallback은 최초 저장 시에만 적용한다.
- remote actor refresh는 저장된 `lastFetchedAt`이 7일을 넘으면 기존 active profile 참조를 막지 않고 federation 내부 materialization 경로에서 비동기적으로 예약/수행하며, 실패한 resolve에 대한 negative cache는 두지 않는다.
- remote `Profile`은 GraphQL Node와 handle 조회에서 local profile과 같은 `Profile` 타입으로 노출하되, 소속 instance의 `kind`를 `Profile.instance.kind`로 구분한다.
- active profile 선택과 session restore는 account ownership 및 active/non-`SUSPENDED` visibility를 기준으로 instance kind와 무관하게 처리한다. 신규 remote follow 생성은 후속 change 전까지 차단하지만, 이미 저장된 visible 관계의 조회와 unfollow는 instance kind로 차단하지 않는다.
- web은 저장된 remote profile의 링크를 bare local handle이 아니라 `relativeHandle` 기반 federated handle URL로 만들고, remote follow가 도입되기 전까지 remote profile의 follow action을 숨기거나 비활성화한다.
- ActivityPub remote follow/Undo delivery, inbox activity 처리, outbox/Note ingestion, `Profile.posts` 확장은 별도 change로 분리한다.

## Capabilities

### New Capabilities

- `activitypub-remote-profile-federation`: Fedify 기반 remote actor lookup/refresh와 kosmo `Profile` projection 경계를 다룬다.

### Modified Capabilities

- `data-model`: remote actor refresh metadata와 remote profile materialization 저장 요구사항을 추가한다.
- `profile`: `Profile.instance.kind`, DB-only federated handle 조회, active remote profile object visibility, ownership/visibility 기반 선택·기존 follow 관계 접근을 반영한다.

## Impact

- `packages/fedify`: Fedify API를 사용한 remote actor lookup과 typed actor projection adapter를 소유한다.
- `packages/core/db`: ActivityPub actor refresh metadata와 actor URI/profile unique 경계를 저장할 테이블/컬럼/index가 필요하다.
- `apps/api`: `Profile.instance.kind`, DB-only `profileByHandle`, remote profile Node visibility, ownership/visibility 기반 선택·session restore·기존 follow 관계 접근, schema regeneration, GraphQL 테스트가 필요하다.
- `apps/web`: 저장된 remote profile 표시에는 `Profile.instance.kind`를, profile 링크에는 `relativeHandle`을 사용하고, remote follow가 아직 없는 상태에서 local follow action을 노출하지 않는다.
- 후속 changes: remote follow와 remote post ingestion은 이 foundation change에 의존한다.
