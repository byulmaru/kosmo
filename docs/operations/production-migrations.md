# Production migration 실행 경계

## 책임

Production migration은 모든 활성화 workload와 같은 immutable release image를 사용하지만 database 권한은 분리한다.

- PROD-562 구현은 production migration 전용 database identity와 Kubernetes Secret을 준비한다.
- PROD-564의 Helm Job은 그 Secret의 `username`과 `password`만 읽고 기존 `migrate` command를 실행한다.
- Runtime workload의 Secret을 migration에 복제하거나 migration 장애 시 fallback으로 사용하지 않는다.
- PROD-783 구현은 `main` push의 production candidate 또는 승인된 manual full-SHA release를 production 배포 입력으로 삼는다. Automatic candidate는 승인 전에 prod image를 build하고, manual target은 `prod` Environment 승인 뒤에 checkout·build한다. 어느 경로든 `prod` Environment의 한 번의 required reviewer 승인 뒤에만 Argo CD credential, migration과 모든 활성화 workload를 변경한다. 같은 prod build digest의 migration Job 성공 뒤에만 wave 2 workload를 활성화한다.
- PROD-545는 runtime 준비, restore rehearsal, 첫 production release와 public smoke의 최종 통합을 검증한다.

Migration database identity에는 schema migration에 필요한 권한만 부여한다. Runtime workload database identity에는 DDL 권한을 부여하지 않는다.

## Helm interface

Production migration Job은 다음 값만 사용한다.

- `env=prod`
- `imageDigest=sha256:<64 lowercase hex>`
- `migration.enabled=true`

Job과 모든 활성화 workload는 `image@sha256:...` 형태의 같은 image reference를 렌더한다. Production migration에서 mutable tag나 유효하지 않은 digest를 사용하면 Helm render가 실패한다.

Migration Job은 기반 리소스가 적용되는 기본 Sync wave 뒤의 wave 1에서 실행하고, API·Web Rollout·HPA와 background Deployment는 Job 성공 뒤 wave 2에서 교체한다. Migration을 `PreSync`로 실행하거나 workload와 같은 wave에 배치하지 않는다.

Application workload에는 별도 activation flag가 없다. API·Web Service·Rollout·HTTPRoute와 background Deployment는 chart에서 항상 렌더되며, 승인된 automatic main candidate 또는 manual full-SHA release가 `prod` Environment의 credential·OIDC 범위와 감사 기록을 사용해 target full SHA, immutable prod digest와 migration 설정을 갱신한다. 따라서 production Application에는 release workflow가 설정한 유효한 `imageDigest` parameter와 target source revision이 존재해야 한다. Dev image는 별도 환경 build이므로 production migration에서 사용하지 않는다. `prod` Environment 승인은 해당 release의 production 상태 변경 전체를 보호하는 유일한 사람 승인이다.

Migration 대상은 Helm release의 PostgreSQL read-write Service, `5432` port와 `kosmo` database로 고정한다. Job은 `<release>-postgres-migration` Secret의 `username`과 `password`만 읽으며 database URL, host, database 또는 Secret 이름/key를 release 입력으로 받지 않는다. Secret이 없거나 key가 누락되면 Kubernetes가 container를 시작할 수 없고 runtime credential로 재시도하지 않는다.

Migration Job은 다음 command만 실행한다.

```text
migrate
```

Phase, schema authority, restore point, target LSN, workload compatibility 또는 rollback window는 이 Job의 value, annotation이나 command mode가 아니다.

`migrate`는 release image의 `packages/core/drizzle.config.ts`가 지정한 Drizzle migration directory를
version-control 순서로 읽고, config의 `migrations.schema`·`migrations.table`이 지정한 history(현재
`drizzle.__drizzle_migrations`)의 각 적용 name이 local migration에 존재하고 hash가 같은지 검증한다. 병렬
branch가 timestamp와 다른 순서로 merge·배포되어 history row 순서가 local 정렬과 달라도 같은 name/hash
집합이면 유효하게 인식하고, 이미 적용된 name을 제외한 pending 파일만 version-control 순서로 실행한다. Local에
없는 history, 같은 name의 hash 변경과 중복 name/history는 새 SQL 실행 전에 거부한다. 각 migration 파일의
statement와 해당 history insert는 같은 독립 transaction에 넣는다. 따라서 파일 하나가 성공하면 schema와
history가 함께 commit되고, 실패하면 그 파일의 변경만 함께 rollback된다. 앞에서 성공한 파일은 뒤 파일 실패로
되돌리지 않는다.

`drizzle.config.ts`의 `dbCredentials`는 Drizzle Kit CLI 설정이다. Runtime `migrate`는 이를 connection source로
사용하지 않고, injectable `DATABASE_URL` 또는 PostgreSQL environment와 `DATABASE_MIGRATION_ROLE`을 사용한다.

## Release 실행 순서

### Main automatic candidate

1. `main` push가 같은 full SHA에서 dev image와 prod production candidate image를 각각 build한다. Dev image는 기존 `Deploy Dev` 경로로 전달하고, prod candidate의 digest와 SHA는 approval job에 직접 전달한다. 두 image는 환경별 build 설정을 사용하므로 동일 digest일 필요가 없다.
2. Prod candidate build가 성공하면 `prod` Environment approval을 요청한다. 승인 전에는 Argo CD production credential을 얻거나 migration·workload 상태를 변경하지 않는다.
3. Reviewer는 candidate full SHA, prod digest, Helm/chart diff와 migration compatibility를 확인한 뒤 한 번 승인한다. 승인 시점의 최신 `main` 또는 mutable image tag를 다시 읽지 않는다.
4. 승인 job은 candidate full SHA를 Argo source revision으로 고정하고 candidate prod digest와 migration Secret으로 migration Job을 실행해 완료를 기다린다.
5. Job이 성공한 경우에만 같은 prod digest의 API·Web Rollout·HPA와 background Deployment를 wave 2에서 활성화한다. 성공한 digest에만 `stable` 보존 tag를 적용한다.

### Manual full-SHA release

1. `main`에 저장된 release workflow를 `main` ref에서 수동 실행하고 repository에 존재하는 정확한 40자리 target SHA를 입력한다. Preflight는 workflow ref·SHA 형식·commit 존재 여부와 target URL만 확인하며 target code checkout, prod secret/credential 접근과 build를 하지 않는다.
2. Reviewer가 target SHA와 DB compatibility를 확인해 `prod` Environment를 한 번 승인한 뒤에만 target SHA를 checkout하고 prod image를 build한다. Dispatch의 `github.sha`가 아니라 resolved target SHA를 source, Sentry release와 metadata에 사용한다.
3. Build가 만든 prod digest와 migration Secret으로 migration Job을 실행하고, 성공 뒤 같은 digest의 API·Web Rollout·HPA와 background Deployment를 wave 2에서 활성화한다. 성공한 digest에만 `stable` 보존 tag를 적용한다.

두 경로는 같은 production concurrency, migration success barrier와 감사 필드를 사용한다. 실행 중인 release는 취소하지 않으며, pending candidate를 대체하는 경우 취소된 SHA와 trigger를 Actions 기록에 남긴다. Candidate build 또는 migration이 실패하면 배포를 중단하고 기존 workload를 그대로 유지한다. Main DB-compatible revert 또는 호환 가능한 manual full SHA로 새 forward release를 실행한다.

Git tag push, `production` branch push와 일반 branch push는 production migration을 시작하지 않는다. 배포 전체 절차와 검증 증거는 [Production release 운영 runbook](./production-release.md)을 따른다.

Migration Job과 workload 사이의 success barrier는 PROD-564/PROD-783 구현을 사용하며 전체 release 완료 판단은 PROD-545가 소유한다.

## Destructive migration

`memory/database-migrations.md`의 expand → transition → contract 정책은 계속 적용한다. 다만 모든 production release에 generic phase/evidence JSON gate를 적용하지 않는다.

실제 destructive contract migration은 해당 schema migration 이슈·PR·release에서 다음을 구체적으로 정의하고 검증한다.

- Expand/transition/backfill 완료 상태
- Active, preview와 rollback 대상 구버전 workload 호환성
- Rollback 보장 기간 종료
- 필요한 backup/restore evidence와 복구 절차
- 실패 뒤 forward migration 또는 승인된 restore 판단

Contract SQL은 transition image에 미리 포함하지 않는다. 각 단계는 독립 PR과 release로 전달한다.

## 실패와 복구

- Credential 또는 Secret 실패: SQL을 실행하지 않는다. Runtime credential로 우회하지 않는다.
- Advisory lock 실패: 다른 migration을 확인하고 종료된 뒤 원인을 수정한 main PR 또는 승인된 manual full-SHA release로 새 production candidate와 같은 자동 경로를 재시도한다.
- SQL 또는 timeout 실패: 실패한 migration 파일의 schema와 history를 rollback하고 wave 2 workload 활성화를 중단한다. Drizzle history를 수동 성공 처리하지 않는다.
- 부분 적용: 앞서 성공한 파일의 schema와 history는 유지한다. 자동 down migration이나 database rollback을 실행하지 않고, 원인을 수정한 새 production push가 이미 적용된 name/hash를 건너뛰고 아직 적용되지 않은 파일만 재시도하거나 새 forward migration을 사용한다.
- Destructive migration의 restore 판단: 해당 schema migration runbook과 [Production PostgreSQL backup과 복구](./postgres-backup.md)를 따른다.

완료 여부와 Drizzle migration count/hash 같은 비민감 식별 정보만 감사 기록에 남긴다. Credential, connection string과 database row 값은 출력하지 않는다.
