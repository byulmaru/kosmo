## Context

PR #773은 local Temporal `start-dev`와 Worker 개발 실행을 추가했지만, 실제 `pnpm dev`는 이미 존재하는 PostgreSQL을 전제로 한다. PROD-897은 같은 PR에서 빈 local PostgreSQL의 최초 준비부터 반복 개발 runtime까지 완성해야 한다. Production runtime 계약은 canonical `PG*`, shared non-owner `kosmo_runtime`, migration owner, 별도 Fedify queue database/role을 이미 정하고 있으며 local 환경도 그 경계를 축소 복제해야 한다.

## Goals / Non-Goals

**Goals:**

- PostgreSQL의 영속 lifecycle과 Temporal의 ephemeral lifecycle을 분리한다.
- 사람이 Vault에 넣은 local 전용 credential로 빈 PostgreSQL을 idempotent하게 준비한다.
- application process에는 runtime `PG*`만, queue process에는 별도 queue credential만 전달한다.
- `pnpm dev`가 destructive initialization 없이 전체 개발 runtime을 시작하게 한다.
- 실제 process, database catalog, health/readiness와 data 보존을 검증한다.

**Non-Goals:**

- Vault Secret 생성·수정·삭제 또는 dev/prod credential 복제
- production database, role, Secret, deployment 변경
- 기존 immutable migration 수정
- Fedify official queue adapter를 대체하는 custom migration, parser 또는 compatibility layer
- Temporal persistent storage 추가

## Implementation Guidance

### Current Constraints

- `packages/core/db` application runtime은 libpq 표준 `PG*`를 사용한다. Migration entrypoint는 test/CLI 호환을 위해 `DATABASE_URL`도 받을 수 있으므로 local 준비 coordinator가 owner `PG*`를 명시하고 inherited `DATABASE_URL`을 제거해야 한다.
- Local Instance bootstrap은 이미 `apps/api/scripts/bootstrap-local-instance.ts`와 idempotent core service를 제공한다. 이를 평상시 dev가 아니라 최초 준비에서 재사용해야 한다.
- Fedify queue schema 초기화는 official PostgreSQL adapter가 소유하므로 local bootstrap SQL에 queue table을 추가하면 안 된다.
- `scripts/vault-run.mjs`는 하나의 Vault path를 command environment에 합친다. Bootstrap path와 runtime path를 함께 읽어야 하는 최초 준비는 wrapper를 중첩할 수 있지만, privileged 값은 실제 migration/bootstrap/runtime child environment에서 제거해야 한다.
- `pnpm --recursive --parallel --if-present dev`는 workspace별 `dev` script만 실행한다. Worker와 consumer의 loopback health port는 manifest script에서 충돌 없이 정해야 한다.

### Recommended Approach

- PostgreSQL 전용 Compose 파일에 named volume, loopback port, healthcheck만 선언한다. Temporal은 기존 `apps/worker/src/temporal-test-server.ts`를 재사용하고 별도 Compose, UI, 독립 lifecycle을 추가하지 않는다.
- 하나의 작은 local-development coordinator CLI가 target 검증, PostgreSQL lifecycle, idempotent role/database bootstrap, owner migration, runtime Local Instance bootstrap과 child environment 최소화를 담당하게 한다. 서비스 병렬 실행과 signal 처리는 pnpm에 맡긴다.
- 정상 개발은 service startup과 runtime launch만 수행한다. 별도의 `local:prepare` 명령만 bootstrap SQL, migration, Local Instance 및 queue 연결 준비를 실행한다.
- Bootstrap SQL은 PostgreSQL identifier를 고정된 local contract로만 사용하고 비밀번호는 parameter 또는 `psql` variable로 전달한다. 출력에는 key 이름과 실패 원인만 남기고 값을 남기지 않는다.
- Runtime launch 전에 host/port/database/user와 queue URL target을 allowlist로 검증하고 `DATABASE_URL`, admin/owner credential을 제거한 environment로 정확히 다섯 workspace dev script를 실행한다. 실제 인증은 각 connection owner가 수행하며 role/ACL catalog 검증은 최초 준비와 통합 검증에서 수행한다.
- Test는 coordinator command를 실제 실행하되 fake executable 또는 임시 PostgreSQL로 외부 경계만 대체한다. 통합 검증에서는 실제 Compose PostgreSQL, migration, bootstrap, API/Worker/consumer를 사용한다.

### Allowed Alternatives

- Coordinator 내부 PostgreSQL bootstrap은 설치 의존성이 없는 기존 workspace PostgreSQL client를 사용하거나 container의 `psql`을 사용할 수 있다. 단, credential 출력 금지, idempotence, owner/runtime/queue 경계와 실제 검증은 동일하게 유지해야 한다.
- Queue initialization은 명시적 prepare probe 또는 첫 consumer startup에 맡길 수 있다. 어느 경우든 official adapter가 schema를 소유해야 한다.

### Known Traps

- Compose environment에 source default password를 넣거나 command line argument로 password를 노출하지 않는다.
- `pnpm dev`에서 migration, seed, Local Instance bootstrap 또는 volume reset을 호출하지 않는다.
- application `DATABASE_URL` fallback, owner credential fallback, queue/application password 재사용을 만들지 않는다.
- 기존 test PostgreSQL의 54329/destructive 설정을 local persistent PostgreSQL에 재사용하지 않는다.
- legacy `kosmo_api`, `kosmo_worker` ACL을 migration replay가 요구하는 경우 role 존재만 준비하되 application login credential로 사용하지 않는다.

## Risks / Trade-offs

- [개발자가 local Vault key를 아직 설정하지 않으면 최초 준비/실행이 실패함] → 정확한 path와 key만 fail-fast로 안내하고 secret value는 자동 생성하지 않는다.
- [Bootstrap 중간 실패로 일부 role/database만 생성될 수 있음] → 각 단계는 idempotent하게 만들고 재실행으로 수렴시키며 migration 자체의 transaction/history를 사용한다.
- [Compose container 안의 admin password 변경은 기존 volume에 자동 반영되지 않음] → bootstrap은 현재 admin credential로 연결하며 credential 변경은 data lifecycle과 별개인 명시적 운영으로 남긴다.
- [전체 workspace dev는 장기 실행 process라 자동 검증이 어려움] → bounded smoke process와 health/database probe로 실제 연결을 검증하고 종료 후 data를 재검사한다.

## Migration Plan

1. Local Vault의 runtime 및 bootstrap path에 사람이 local 전용 credential을 설정한다.
2. Docker를 실행하고 명시적 최초 준비 명령으로 PostgreSQL, role/database, migration, Local Instance를 준비한다.
3. `pnpm dev`를 실행해 PostgreSQL, 기존 ephemeral Temporal server와 전체 service를 시작한다.
4. 문제가 있으면 process와 container를 중지하되 PostgreSQL volume은 보존한다. 코드 rollback은 새 local Compose/script만 제거하며 production에는 영향을 주지 않는다.

## Open Questions

없음. PostgreSQL endpoint/database, bootstrap Vault path, Fedify consumer 포함 여부와 health port는 사용자 지시로 확정되었다.
