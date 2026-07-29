## Why

현재 Local ActivityPub actor는 `followers`와 `following`을 광고하지 않아 원격 서버가 이미 저장된 팔로워 수와
팔로잉 수를 알 수 없다. membership 목록은 비공개로 유지하면서 ActivityStreams collection의 `totalItems`로
두 수를 제공한다.

## What Changes

- Local ActivityPub actor document에 canonical `followers`와 `following` collection URI를 추가한다.
- 두 collection은 저장된 `followersCount` 또는 `followingCount`를 `totalItems`로 반환한다.
- collection membership, page와 item은 공개하지 않는다.
- Local Profile 공개 조건과 Local Instance별 actor identity를 collection에도 동일하게 적용한다.
- outbound followers expansion, GraphQL follow graph와 remote collection materialization은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`
- Linear Contract: PROD-560
- Linear Implementations: PROD-560

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-actor-discovery`: Local actor가 count-only followers/following collection을 광고하고 제공하도록 공개
  범위를 확장한다.

## Impact

- `packages/fedify`: Local actor 조회 projection, `Person` 직렬화, count-only collection dispatcher와 federation
  테스트가 변경된다.
- `openspec/specs/activitypub-actor-discovery/spec.md`: 기존 social graph collection 제외 계약이 count-only 공개
  계약으로 바뀐다.
- DB schema, GraphQL schema, 앱 UI와 dependency는 변경하지 않는다.
