## Context

이 기록은 PROD-897의 확정된 local development 범위, application PostgreSQL runtime ADR, core service architecture와 본 변경의 기술 설계를 반영한다. 2026-09-16 사용자 지시는 Linear 본문의 제안 값을 승인하고 PostgreSQL 범위를 PR #773의 현재 완료 조건으로 확정했다.

## Decision Records

### Local PostgreSQL endpoint와 database 이름을 고정한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-897`, 2026-09-16 사용자 확정
- Status: Active
- Context / Problem: Dev/prod 또는 test PostgreSQL과 혼동하지 않는 안전한 local target이 필요하다.
- Decision Outcome: PostgreSQL은 `127.0.0.1:54328`, application database는 `kosmo`, Fedify queue database는 `kosmo_fedify_queue`를 사용한다.
- Alternatives Considered: test PostgreSQL `54329` 재사용과 configurable endpoint는 destructive test lifecycle 또는 잘못된 target 연결 위험 때문에 선택하지 않았다.
- Consequences: Local coordinator와 문서는 exact target을 검증하며 다른 target에서 bootstrap/runtime을 실행하지 않는다.
- Confirmation / Follow-up: Compose render, actual connection target과 database catalog로 검증한다.

### Runtime, migration owner와 queue credential을 분리한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, Linear `PROD-897`
- Status: Active
- Context / Problem: Application process가 owner 권한 또는 queue credential을 사용하면 production runtime 경계를 local에서 검증할 수 없다.
- Decision Outcome: Migration owner는 `kosmo`, application runtime은 non-owner `kosmo_runtime`, queue database owner/runtime은 `kosmo_fedify_queue`로 분리한다. Application connection은 canonical `PG*`만 사용한다.
- Alternatives Considered: 하나의 owner credential 공유, role별 application credential, `DATABASE_URL` compatibility fallback은 canonical runtime 계약과 충돌하므로 선택하지 않았다.
- Consequences: Bootstrap은 세 credential을 구분하고 privileged value를 runtime child에 전달하지 않는다.
- Confirmation / Follow-up: `current_user`, role attribute/membership, object ownership, ACL과 child environment를 검증한다.

### Bootstrap credential은 별도 Vault path에서만 읽는다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-897`, 2026-09-16 사용자 확정
- Status: Active
- Context / Problem: PostgreSQL container admin 및 migration owner password는 application runtime secret보다 높은 권한을 가진다.
- Decision Outcome: Bootstrap key `LOCAL_POSTGRES_ADMIN_PASSWORD`, `LOCAL_POSTGRES_OWNER_PASSWORD`는 `secret/kubernetes/kosmo/local/postgres-bootstrap`에서 사람이 설정한다. Runtime key는 `secret/kubernetes/kosmo/local`에 유지한다.
- Alternatives Considered: source default, 자동 password 생성/저장, dev/prod credential 복제, runtime path에 privileged key 병합은 secret 경계와 사용자 금지 사항 때문에 선택하지 않았다.
- Consequences: Vault 값이 없으면 fail-fast하며 자동화는 Secret mutation이나 value 출력을 하지 않는다.
- Confirmation / Follow-up: Missing-key 오류와 redacted output, runtime environment에서 bootstrap key 제거를 검증한다.

### 최초 준비와 pnpm dev를 별도 lifecycle로 둔다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-897`
- Status: Active
- Context / Problem: 일반 개발 실행이 schema/data를 초기화하면 반복 개발에서 data를 잃고 migration/bootstrap 실패가 service startup에 섞인다.
- Decision Outcome: 명시적 최초 준비 명령만 role/database/ACL, migration, Local Instance 준비를 수행하고 해당 invariant는 통합 검증에서 확인한다. `pnpm dev`는 고정된 local target과 필수 key를 검증하고 service만 시작하며 privileged catalog probe를 반복하지 않는다.
- Alternatives Considered: 매 dev 실행 migration/bootstrap, reset/seed와 dev 결합은 destructive behavior 금지와 충돌하므로 선택하지 않았다.
- Consequences: 새 개발자는 최초 한 번 준비 명령을 실행하며 기존 개발자는 평상시 dev만 반복한다.
- Confirmation / Follow-up: PostgreSQL 재시작과 `pnpm dev` 재실행 전후 data 보존을 검증한다.

### Fedify consumer를 기본 dev runtime에 포함한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, Linear `PROD-897`, 2026-09-16 사용자 확정
- Status: Active
- Context / Problem: Producer만 실행하면 local 개발에서 accepted queue message가 소비되지 않고 queue runtime 경계를 검증할 수 없다.
- Decision Outcome: 기본 `pnpm dev`에 독립 Fedify consumer를 포함하고 health/readiness를 `127.0.0.1:8082`에 둔다. Worker는 기존 `127.0.0.1:8081`을 유지한다.
- Alternatives Considered: opt-in 별도 consumer 실행과 worker process 결합은 기본 완료 조건 또는 독립 runtime 계약을 충족하지 않아 선택하지 않았다.
- Consequences: Workspace recursive dev에 consumer `dev` script가 포함되고 두 health port가 충돌하지 않는다.
- Confirmation / Follow-up: Consumer readiness와 queue database connection을 실제 process로 검증한다.

### PostgreSQL만 독립 lifecycle로 관리하고 기존 Temporal local server를 재사용한다

- Decision Date: 2026-09-16
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-897`
- Status: Active
- Context / Problem: Application data는 반복 개발에서 보존되어야 하지만 local Temporal history는 현재 임시 개발 server 정책을 따른다.
- Decision Outcome: PostgreSQL은 named volume을 사용한다. Temporal은 `apps/worker/src/temporal-test-server.ts`의 기존 ephemeral local server를 `127.0.0.1:7233`에서 재사용하며 별도 Compose, UI, 독립 lifecycle을 추가하지 않는다.
- Alternatives Considered: PROD-897 전용 Temporal Compose와 `:8233` UI는 원래 Linear Issue 범위를 확장하므로 제거했다. Temporal SQLite volume 복원도 범위 밖이다.
- Consequences: `local:down`은 PostgreSQL만 중지하고 Temporal은 `pnpm dev`와 함께 종료된다. Temporal 상태는 보존 대상으로 간주하지 않는다.
- Confirmation / Follow-up: PostgreSQL Compose render와 restart persistence, 기존 Temporal server의 RPC readiness를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
