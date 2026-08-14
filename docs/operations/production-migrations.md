# Production migration 실행 경계

## 책임

Production migration은 API/Web과 같은 immutable release image를 사용하지만 database 권한은 분리한다.

- PROD-562 구현은 production migration 전용 database identity와 Kubernetes Secret을 준비한다.
- PROD-564의 Helm Job은 그 Secret의 `username`과 `password`만 읽고 기존 `migrate` command를 실행한다.
- API/Web의 runtime Secret을 migration에 복제하거나 migration 장애 시 fallback으로 사용하지 않는다.
- PROD-563 구현은 production 대상 PR의 merge를 production 배포 승인으로 삼고, merge로 발생한 production push의 migration/API/Web 전체를 별도 승인 없이 배포한다. 같은 build digest의 migration Job 성공 뒤에만 API/Web을 활성화한다.
- PROD-545는 runtime 준비, restore rehearsal, 첫 production release와 public smoke의 최종 통합을 검증한다.

Migration database identity에는 schema migration에 필요한 권한만 부여한다. API/Web database identity에는 DDL 권한을 부여하지 않는다.

## Helm interface

Production migration Job은 다음 값만 사용한다.

- `env=prod`
- `imageDigest=sha256:<64 lowercase hex>`
- `workloads.enabled=true`
- `migration.enabled=true`

Job, API와 Web은 모두 `image@sha256:...` 형태의 같은 image reference를 렌더한다. Production migration에서 mutable tag나 유효하지 않은 digest를 사용하면 Helm render가 실패한다.

첫 release 전 runtime bootstrap은 `workloads.enabled=false`로 API/Web Service·Rollout·HTTPRoute를 렌더하지 않고 PostgreSQL, backup과 Secret 기반만 준비한다. 보호된 `production` push의 자동 배포가 `prod` Environment의 credential·OIDC 범위와 감사 기록을 사용해 digest와 함께 workload와 migration을 활성화한다. `prod` Environment는 사람의 추가 승인 gate가 아니다.

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

1. Production 대상 PR이 필수 review와 checks를 통과한 뒤 merge된다. 이 merge가 유일한 사람의 production 배포 승인이다.
2. Merge로 발생한 보호된 `production` push가 production image를 build하고 digest와 immutable source SHA를 확정한다.
3. 같은 workflow가 `prod` Environment의 credential·OIDC 범위와 감사 기록을 사용해 별도 사람 승인 없이 배포를 진행한다.
4. 같은 digest와 migration Secret으로 migration Job을 실행하고 완료를 기다린다.
5. Job이 성공한 경우에만 같은 digest의 API/Web workload를 활성화한다.
6. Job이 실패하면 배포를 중단하고 기존 workload를 그대로 유지한다. 수정 PR 또는 DB와 호환되는 revert PR을 `production`에 merge해 새 push로 재시도한다.

Tag push와 수동 workflow 실행은 production migration을 시작하지 않는다. 배포 전체 절차와 검증 증거는 [Production release 운영 runbook](./production-release.md)을 따른다.

Migration Job과 workload 사이의 success barrier는 PROD-563 구현을 사용하며 전체 release 완료 판단은 PROD-545가 소유한다.

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
- Advisory lock 실패: 다른 migration을 확인하고 종료된 뒤 원인을 수정한 production PR을 merge해 새 production push와 같은 자동 경로로 재시도한다.
- SQL 또는 timeout 실패: 실패한 migration 파일의 schema와 history를 rollback하고 API/Web 활성화를 중단한다. Drizzle history를 수동 성공 처리하지 않는다.
- 부분 적용: 앞서 성공한 파일의 schema와 history는 유지한다. 자동 down migration이나 database rollback을 실행하지 않고, 원인을 수정한 새 production push가 이미 적용된 name/hash를 건너뛰고 아직 적용되지 않은 파일만 재시도하거나 새 forward migration을 사용한다.
- Destructive migration의 restore 판단: 해당 schema migration runbook과 [Production PostgreSQL backup과 복구](./postgres-backup.md)를 따른다.

완료 여부와 Drizzle migration count/hash 같은 비민감 식별 정보만 감사 기록에 남긴다. Credential, connection string과 database row 값은 출력하지 않는다.
