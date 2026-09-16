## 1. PROD-897 Local PostgreSQL lifecycle

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- Linear `PROD-897`

**Deliverable**

빈 local PostgreSQL을 준비하면 분리된 owner/runtime/queue role과 application/queue database가 생성되고, 재시작 뒤에도 data가 보존된다.

**Guardrails**

- Endpoint는 `127.0.0.1:54328`, application database는 `kosmo`, queue database는 `kosmo_fedify_queue`이다.
- PostgreSQL은 named volume을 사용하고 test DB의 destructive 설정을 재사용하지 않는다.
- 기존 immutable migration을 수정하지 않는다.

**Verification**

- Compose validator, 빈 volume 최초 준비, role/catalog/ACL/object owner 검사, PostgreSQL restart 전후 data 확인

- [x] 1.1 Local PostgreSQL의 영속 service lifecycle과 안전한 target 검증을 구현한다.
- [x] 1.2 Owner/runtime/queue role과 database를 idempotent하게 준비하고 credential 값이 출력되지 않게 한다.
- [x] 1.3 Owner migration, runtime Local Instance bootstrap과 official Fedify queue 연결 준비를 구현한다.
- [x] 1.4 빈 volume과 반복 준비에 대한 동작 검증을 추가하고 통과시킨다.

## 2. PROD-897 반복 개발 runtime

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- Linear `PROD-897`

**Deliverable**

`pnpm dev`가 준비된 local PostgreSQL과 local Temporal을 사용해 API, Web, App, Worker, Fedify consumer를 비파괴적으로 실행한다.

**Guardrails**

- Application runtime은 canonical `PG*`와 `kosmo_runtime`만 사용하고 `DATABASE_URL` fallback을 추가하지 않는다.
- Queue credential과 migration/bootstrap credential은 application runtime과 분리한다.
- 일반 `pnpm dev`는 reset, seed, migration, Local Instance bootstrap 또는 data deletion을 수행하지 않는다.
- Temporal은 기존 ephemeral `start-dev`와 무볼륨 구성을 유지한다.
- Worker health는 `127.0.0.1:8081`, consumer health는 `127.0.0.1:8082`이다.

**Verification**

- Runtime 구성 오류 동작 test, 실제 API GraphQL/Web health/Worker readiness/Temporal/consumer readiness/queue connection, dev 재실행 전후 data 확인

- [x] 2.1 Runtime 및 queue target/key 검증과 privileged environment 제거를 동작 test로 먼저 정의한다.
- [x] 2.2 전체 workspace service와 독립 health port를 기본 dev 실행에 연결한다.
- [x] 2.3 일반 dev 경로가 destructive 초기화를 호출하지 않고 data를 보존하는지 실제 process로 검증한다.

## 3. PROD-897 운영 지침과 최종 검증

**Authority / Provenance**

- `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`
- `docs/architecture/core-services.md`
- Linear `PROD-897`

**Deliverable**

사람이 필요한 Vault 설정, 최초 준비, 반복 개발, credential 및 storage lifecycle을 정확히 실행할 수 있고 최신 main merge tree에서 required validation과 review를 통과한다.

**Guardrails**

- Vault Secret 생성·수정·삭제와 credential 복제를 자동화하지 않는다.
- 비밀번호를 source, default, log, artifact 또는 Git에 넣지 않는다.
- PR readiness와 PROD-897 완료 표현은 전체 검증이 끝난 뒤 결정한다.

**Verification**

- OpenSpec strict validation, README/script guidance review, repository required checks, latest merge tree integration test, unresolved review thread와 final correctness/over-engineering review

- [x] 3.1 두 Vault path의 정확한 key와 목적, 최초 준비와 평상시 실행, credential/storage 경계를 문서화한다.
- [x] 3.2 최신 main과 안전하게 동기화하고 conflict에서 main 및 PROD-897 의도를 모두 보존한다.
- [x] 3.3 최종 merge tree에서 required validation과 PROD-897 통합 검증을 실행한다.
- [x] 3.4 Correctness 및 over-engineering review finding을 수정하고 unresolved thread를 확인한다.
- [x] 3.5 완료 증거에 맞춰 Linear, PR 본문과 Draft/Ready 상태를 정리한다.
