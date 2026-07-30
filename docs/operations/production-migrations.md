# Production migration 실행 경계

## 책임

Production migration은 API/Web과 같은 immutable release image를 사용하지만 database 권한은 분리한다.

- PROD-562 구현은 production migration 전용 database identity와 Kubernetes Secret을 준비한다.
- PROD-564의 Helm Job은 그 Secret의 `username`과 `password`만 읽고 기존 `migrate` command를 실행한다.
- API/Web의 runtime Secret을 migration에 복제하거나 migration 장애 시 fallback으로 사용하지 않는다.
- PROD-563 구현은 모든 Git tag build의 migration/API/Web 전체를 production 배포로 한 번 승인하고, 같은 build digest의 migration Job 성공 뒤에만 API/Web을 활성화한다.
- PROD-545는 runtime 준비, restore rehearsal, 첫 production release와 public smoke의 최종 통합을 검증한다.

Migration database identity에는 schema migration에 필요한 권한만 부여한다. API/Web database identity에는 DDL 권한을 부여하지 않는다.

## Helm interface

Production migration Job은 다음 값만 사용한다.

- `env=prod`
- `imageDigest=sha256:<64 lowercase hex>`
- `workloads.enabled=true`
- `migration.enabled=true`

Job, API와 Web은 모두 `image@sha256:...` 형태의 같은 image reference를 렌더한다. Production migration에서 mutable tag나 유효하지 않은 digest를 사용하면 Helm render가 실패한다.

첫 release 전 runtime bootstrap은 `workloads.enabled=false`로 API/Web Service·Rollout·HTTPRoute를 렌더하지 않고 PostgreSQL, backup과 Secret 기반만 준비한다. Git tag build의 `prod` Environment 승인을 받은 배포가 digest와 함께 workload와 migration을 활성화한다.

Migration 대상은 Helm release의 PostgreSQL read-write Service, `5432` port와 `kosmo` database로 고정한다. Job은 `<release>-postgres-migration` Secret의 `username`과 `password`만 읽으며 database URL, host, database 또는 Secret 이름/key를 release 입력으로 받지 않는다. Secret이 없거나 key가 누락되면 Kubernetes가 container를 시작할 수 없고 runtime credential로 재시도하지 않는다.

Migration Job은 다음 command만 실행한다.

```text
migrate
```

Phase, schema authority, restore point, target LSN, workload compatibility 또는 rollback window는 이 Job의 value, annotation이나 command mode가 아니다.

## Release 실행 순서

1. Git tag push가 production image를 build하고 digest를 확정한다.
2. 같은 workflow의 `prod` Environment에서 해당 build의 migration/API/Web 배포를 한 번 승인한다.
3. 같은 digest와 migration Secret으로 migration Job을 실행하고 완료를 기다린다.
4. Job이 성공한 경우에만 같은 digest의 API/Web workload를 활성화한다.
5. Job이 실패하면 배포를 중단하고 기존 workload를 그대로 유지한다.

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
- Advisory lock 실패: 다른 migration을 확인하고 종료된 뒤 새 tag build와 같은 승인 경로로 재시도한다.
- SQL 또는 timeout 실패: API/Web 활성화를 중단한다. Drizzle history를 수동 성공 처리하지 않는다.
- 부분 적용: 자동 down migration이나 database rollback을 실행하지 않는다. 새 tag build를 통한 재시도 또는 새 forward migration을 사용한다.
- Destructive migration의 restore 판단: 해당 schema migration runbook과 [Production PostgreSQL backup과 복구](./postgres-backup.md)를 따른다.

완료 여부와 Drizzle migration count/hash 같은 비민감 식별 정보만 감사 기록에 남긴다. Credential, connection string과 database row 값은 출력하지 않는다.
