## Why

현재 MessageQueue가 없는 Fedify direct delivery는 recipient별 HTTP 요청을 즉시 병렬 실행하므로
`orderingKey`를 사용하지 않는다. Local Post dispatcher가 이 값을 요구하고 canonical spec이 Create/Delete
순서를 보장하는 것처럼 서술하면 현재 동작보다 강한 계약과 후속 queue 설계를 미리 고정한다.

## What Changes

- Local Post outbound dispatcher 입력과 Fedify `sendActivity` options에서 `orderingKey`를 제거한다.
- stable Create/Delete activity ID는 유지하되 direct delivery 순서 보장은 제거한다.
- queue ordering key와 Create/Update/Delete 순서 보장은 PROD-448 후속 범위로 명시한다.
- 기존 Repost·Follow delivery의 ordering 동작은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`, `docs/domain/objects/post.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-512
- Linear Implementations: PROD-512

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `activitypub-local-post-delivery`: stable activity ID와 direct delivery ordering 보장을 분리한다.
- `activitypub-outbound-recipient-dispatch`: dispatcher와 Fedify direct delivery에서 ordering key 입력을 제거한다.

## Impact

- `packages/fedify`: dispatcher 인터페이스, Local Post Create/Delete 호출과 테스트
- OpenSpec: Local Post delivery와 outbound recipient dispatcher canonical 요구사항
- Linear: PROD-512의 direct delivery ordering 계약
