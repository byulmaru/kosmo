## Why

kosmo는 local actor discovery 경계를 만들고 있지만, 원격 ActivityPub actor를 kosmo의 기존 `Profile` 모델로 저장하고 읽는 최소 기반은 아직 없다. 이번 변경은 follow나 remote post ingestion까지 확장하지 않고, 저장된 remote actor를 local profile과 같은 GraphQL `Profile`로 다룰 수 있는 foundation만 만든다.

## What Changes

- `profileByHandle(handle:)`는 기존 local handle과 저장된 remote `@handle@domain` 입력을 모두 지원하되, kosmo DB만 조회하고 외부 actor fetch나 저장을 수행하지 않는다.
- remote actor materialization은 공개 GraphQL API가 아니라 federation 내부 service로 제공하며, Fedify의 WebFinger/object lookup과 ActivityPub vocabulary API를 사용한다.
- remote actor identity는 ActivityPub actor URI로 구분하고, kosmo 내부 GraphQL/DB identity는 기존 `Profile.id`를 사용한다.
- actor URI 직접 입력만으로 remote profile을 저장하지 않고, federated handle lookup을 통과한 actor만 저장한다.
- remote actor는 `preferredUsername`을 `Profile.handle`, actor `summary`를 `Profile.bio`, actor `published`를 `Profile.createdAt`에 반영한다.
- remote actor refresh는 저장된 `lastFetchedAt`이 7일을 넘으면 기존 active profile 참조를 막지 않고 federation 내부 materialization 경로에서 비동기적으로 예약/수행하며, 실패한 resolve에 대한 negative cache는 두지 않는다.
- remote `Profile`은 GraphQL Node와 handle 조회에서 local profile과 같은 `Profile` 타입으로 노출하되, `Profile.origin` enum으로 local/remote 성격을 구분한다.
- remote follow, inbox activity 처리, outbox/Note ingestion, `Profile.posts` 확장은 별도 change로 분리한다.

## Capabilities

### New Capabilities

- `activitypub-remote-profile-federation`: Fedify 기반 remote actor lookup/refresh와 kosmo `Profile` projection 경계를 다룬다.

### Modified Capabilities

- `data-model`: remote actor refresh metadata와 remote profile materialization 저장 요구사항을 추가한다.
- `profile`: `Profile.origin` enum, DB-only federated handle 조회, active remote profile object visibility를 반영한다.

## Impact

- `packages/fedify`: Fedify API를 사용한 remote actor lookup과 typed actor projection adapter를 소유한다.
- `packages/core/db`: ActivityPub actor refresh metadata와 actor URI/profile unique 경계를 저장할 테이블/컬럼/index가 필요하다.
- `apps/api`: `Profile.origin`, DB-only `profileByHandle`, remote profile Node visibility, schema regeneration, GraphQL 테스트가 필요하다.
- `apps/web`: 저장된 remote profile 표시에는 `Profile.origin`과 `relativeHandle`을 사용한다.
- 후속 changes: remote follow와 remote post ingestion은 이 foundation change에 의존한다.
