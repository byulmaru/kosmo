## Why

현재 Web inbound ActivityPub와 API가 직접 호출하는 outbound delivery는 전역 owner DB singleton에 결합되어 있다. 목표 구조에서는 API가 outbound Fedify를 직접 실행하지 않고 durable intent만 기록하며, 실제 outbound Fedify는 후속 Temporal Worker Activity에서 실행한다. 특정 Post SQL이나 credential/RLS 전환보다 먼저 Web inbound와 미래 Worker가 공유할 Fedify 전용 DB execution boundary가 필요하다.

## What Changes

- Web inbound Fedify invocation마다 명시적 DB handle을 가진 Fedify execution context를 생성해 전달한다.
- 향후 Temporal Worker Activity가 같은 package-internal Fedify context와 action transaction 경계를 재사용할 수 있게 한다. 이번 change는 Temporal Activity나 Worker를 구현하지 않는다.
- Fedify action이 전달받은 DB handle에서 transaction을 열고 성공 commit, 오류 rollback과 connection 반환을 소유하게 한다.
- Fedify가 사용하는 공유 core service의 기존 optional transaction seam이 database 또는 transaction handle을 선택할 수 있게 한다.
- Fedify context 타입·factory를 API viewer context와 package public surface에서 분리한다.
- 기존 owner credential, 전역 DB fallback, SQL 결과와 post-commit 동작은 유지한다.
- 범용 notification/background system abstraction, API outbound Fedify 호출 seam, 특정 도메인 SQL 이전과 credential·RLS 변경은 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`
- Linear Contract: `PROD-706`
- Linear Implementations: `PROD-706`

## Capabilities

### New Capabilities

- `fedify-db-execution-boundary`: Web inbound와 미래 Temporal Activity가 사용하는 Fedify 전용 DB handle 및 transaction 수명 계약

### Modified Capabilities

없음.

## Impact

- `packages/core/db`: database/transaction handle을 포괄하는 타입과 선택 helper
- `packages/core/services/post`: downstream Post Fedify SQL 이전이 사용할 기존 optional transaction seam
- `packages/fedify`: package-internal Fedify execution context, action runner와 inbound adapter
- `apps/web`: context factory를 노출하지 않는 inbound Fedify adapter 호출
- 테스트: context 격리, commit·rollback, nested transaction, pool 반환과 owner fallback
- dependency, schema migration, runtime credential과 공개 GraphQL/ActivityPub 계약 변화 없음
