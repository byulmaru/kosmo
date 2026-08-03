## Why

Local Profile 편집은 federation-visible actor 표현을 DB에 commit하지만 원격 follower에게 변경을 알리는
ActivityPub lifecycle이 없다. PROD-628이 완성한 canonical `Person` projection을 재사용해 실제 표현 변경만
`Update(Person)`으로 전달해야 한다.

## What Changes

- displayName, bio, avatar, header 또는 Follow Approval Policy가 실제로 달라진 Local Profile update에만
  post-commit ActivityPub delivery lifecycle을 만든다.
- stable local actor identity와 PROD-628의 canonical `Person`을 사용하는 `Update(Person)` activity를 구성한다.
- 공통 outbound recipient dispatcher로 active ActivityPub remote followers에게 direct delivery하고 actor와
  shared inbox 중복을 제거한다.
- rollback, validation 실패, no-op, Profile Tag 전용 변경과 follower 부재에서는 delivery를 시작하지 않는다.
- delivery 실패를 committed Profile과 GraphQL 성공 결과에서 격리해 관측한다.
- caller-owned transaction은 lifecycle을 반환하고 transaction owner가 outer commit 뒤 명시적으로 실행한다.
- transactional outbox, durable retry와 process 종료 시 유실 방지는 PROD-448에 남긴다.

## Authority / Provenance

- Canonical: `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`
- Linear Contract: `PROD-629`
- Linear Implementations: `PROD-629`

## Capabilities

### New Capabilities

- `activitypub-local-profile-update-delivery`: committed Local Profile actor 표현 변경을 canonical
  `Update(Person)`으로 remote followers에게 전달하는 lifecycle

### Modified Capabilities

없음.

## Impact

- Core: `updateProfile`의 실제 actor projection 변경 판정과 명시적 post-commit lifecycle 결과
- Fedify: canonical Local `Person` 재사용, `Update` activity identity와 공통 recipient dispatch
- API: GraphQL `updateProfile` commit 뒤 post-commit lifecycle 실행과 실패 격리
- Verification: core transaction/no-op/rollback, Fedify projection·recipient, GraphQL 성공 결과 회귀 테스트
- 제외 시스템: GraphQL schema·Profile 편집 UI, Profile Tag/Link ActivityPub 표현, transactional outbox와 worker
