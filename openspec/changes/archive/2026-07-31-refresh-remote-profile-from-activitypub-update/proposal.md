## Why

원격 ActivityPub actor가 팔로워 승인 정책을 바꿔도 Kosmo는 7일 refresh TTL 동안 저장된
`Profile.followPolicy`를 유지한다. 그 결과 최신 정책이 `APPROVAL_REQUIRED`인데도 신규 Follow가 즉시 성립할 수
있으므로, 검증된 inbound `Update(Actor)`를 remote profile refresh 신호로 처리해야 한다.

## What Changes

- `Update(Person/Application/Group/Organization/Service)` inbox activity를 검증해 저장된 동일 remote actor
  profile을 즉시 refresh한다.
- Update actor, embedded object와 저장된 ActivityPub actor identity가 모두 일치할 때만 기존 actor
  materialization의 profile projection과 endpoint metadata 갱신을 재사용한다.
- `manuallyApprovesFollowers`를 `OPEN`과 `APPROVAL_REQUIRED` 양방향으로 반영한다.
- unsupported object, identity mismatch, local actor 충돌은 저장 상태를 변경하지 않고, 중복 Update는 멱등
  처리한다.
- policy 변경 전 이미 성립한 관계는 유지하며, 변경 뒤 신규 Follow와 후속 `Accept(Follow)`가 최신 정책을
  따르는지 검증한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`,
  `docs/domain/objects/follow-request.md`
- Linear Contract: `PROD-607`
- Linear Implementations: `PROD-607`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-remote-profile-federation`: 검증된 inbound actor Update가 TTL과 무관하게 기존 remote profile
  projection과 actor endpoint metadata를 갱신하는 계약을 추가한다.

## Impact

- `packages/fedify` inbox listener와 remote actor materialization 경계
- remote actor Update, Follow, Accept 통합 테스트
- 기존 DB schema와 GraphQL schema에는 변경이 없다.
