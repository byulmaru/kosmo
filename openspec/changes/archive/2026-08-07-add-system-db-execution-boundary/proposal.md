## Why

federation, notification과 background system 작업은 viewer GraphQL operation과 다른 actor·transaction 수명을 가지지만, 현재는 전역 owner DB에 암묵적으로 결합되어 있다. Post RLS SQL 이전이나 credential 전환을 가져오지 않고도 system 호출자가 명시적 DB handle을 전달하고 공유 core action이 이를 선택할 수 있는 additive 기반이 먼저 필요하다.

## What Changes

- 현재 production system 진입점인 web/federation이 요청·작업 단위의 명시적 DB execution context를 만들고 전달하며, 별도 background/notification action도 같은 공통 경계를 재사용할 수 있게 한다.
- system action이 전달받은 DB handle에서 transaction을 열고 성공·오류·rollback 뒤 수명을 정리하는 공통 경계를 제공한다.
- 공유 core service의 기존 optional transaction seam을 database 또는 transaction handle을 받을 수 있는 additive 계약으로 확장한다.
- web/federation의 system context와 API viewer context 타입·생성 경계를 분리한다.
- 기존 호출자는 전역 owner DB fallback과 기존 SQL·post-commit 동작을 그대로 유지한다.
- context 격리, rollback, connection pool 반환을 검증한다.
- Post/Profile/Media 등 도메인 SQL 이전, credential·RLS policy·grant 변경, owner credential 제거와 ActivityPub 제품 행동 변경은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`
- Linear Contract: `PROD-706`
- Linear Implementations: `PROD-706`

## Capabilities

### New Capabilities

- `system-db-execution-boundary`: system 작업의 명시적 DB handle 전달, transaction 수명과 additive core service 선택 계약

### Modified Capabilities

없음.

## Impact

- `packages/core/db`: database/transaction handle을 포괄하는 execution 타입과 선택 helper
- `packages/core/services`: 기존 optional transaction 호출과 호환되는 명시적 DB handle seam
- `packages/fedify`: trusted runtime 내부의 system execution context와 federation context data 경계
- `apps/web`: context factory를 노출하지 않는 trusted federation runtime adapter 호출 경계
- 테스트: context 격리, 성공·오류 rollback, pool 반환, 기존 전역 owner fallback 회귀
- dependency, schema migration, runtime credential과 공개 GraphQL/ActivityPub 계약 변화 없음
