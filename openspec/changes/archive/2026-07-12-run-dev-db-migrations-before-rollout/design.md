## Context

현재 Docker image는 API/web server만 실행하고 `drizzle/` migration directory를 runtime stage에 포함하지 않는다. Deploy Dev workflow는 Docker Build 성공 후 Argo CD resource action으로 `latest` API/web Rollout을 restart하며, full sync나 DB migration을 실행하지 않는다. dev의 API/web active·preview workload는 같은 CloudNativePG database를 사용한다.

PROD-280은 production용 무중단 expand/contract 체계를 도입하지 않고, downtime이 허용된 dev에서 version-controlled migration을 workload restart 전에 적용하는 최소 배포 경계를 만든다. runtime은 이미 production dependency로 `drizzle-orm`, `postgres`와 `tsx`를 포함하므로 별도 migration image나 `drizzle-kit` production dependency를 추가하지 않는다.

## Goals / Non-Goals

**Goals:**

- 동일한 dev runtime image가 `migrate` command로 image 안의 SQL migration을 적용한다.
- Drizzle history와 단일 PostgreSQL advisory lock을 사용해 재실행과 동시 실행을 안전하게 처리한다.
- Argo CD `PreSync` Job 실패가 rollout restart를 차단한다.
- dev `latest` image 정책과 기존 Argo Rollout resource action을 유지한다.
- PROD-267 migration을 data reset 없이 적용할 실행 경계를 제공한다.

**Non-Goals:**

- production immutable image, zero-downtime expand/transition/contract와 rollback window.
- app DB role과 별도의 production DDL credential.
- backup/restore, automatic rollback과 배포 후 smoke/E2E.
- migration SQL 생성 방식 또는 domain schema 변경.

## Risks / Trade-offs

- [`latest`가 migration과 workload 사이에 바뀔 수 있음] → Deploy Dev를 environment 단위로 직렬화하고 Docker Build 성공 직후 full sync와 restart를 한 workflow에서 수행한다. production의 immutable identity 문제는 PROD-269에 남긴다.
- [GitHub workflow 취소 후 Argo hook이 남을 수 있음] → `cancel-in-progress`를 끄고 PostgreSQL advisory lock으로 겹친 runner가 SQL을 실행하지 못하게 한다.
- [Drizzle migrator history만으로 동시 실행을 막지 못함] → connection pool을 1로 제한한 session에서 `pg_try_advisory_lock`을 먼저 획득하고 실패 시 즉시 종료한다.
- [Migration SQL 실패] → Drizzle의 PostgreSQL transaction과 실패 exit status를 사용하며 Argo `PreSync` 실패가 이후 restart step을 차단한다.
- [파괴적 migration 직후 기존 dev workload가 실패할 수 있음] → dev downtime을 허용하고 migration 성공 직후 새 `latest` workload를 restart한다. production에서는 허용하지 않는다.
- [Argo selective sync는 hook을 실행하지 않음] → Deploy Dev가 resource 선택 없이 application full sync를 호출한다.
- [Job 자동 retry가 논리 오류를 반복함] → `backoffLimit: 0`, `restartPolicy: Never`와 제한된 실행 시간을 사용한다.

## Migration Plan

1. runtime image에 `drizzle/`을 복사하고 `migrate` entrypoint를 추가한다.
2. runner는 `DATABASE_URL`, image 안 migration directory와 단일 connection을 사용해 advisory lock을 획득한 뒤 Drizzle migrator를 실행한다.
3. Helm chart에 dev workload와 같은 image/DB secret을 사용하는 `PreSync` Job을 추가한다.
4. Deploy Dev를 직렬화하고 `argocd app sync kosmo-dev` 성공 후에만 API/web restart action을 실행한다.
5. disposable test database에서 최초 적용, no-op 재실행, 실패와 lock contention을 검증하고 Helm render와 workflow 순서를 확인한다.
6. PROD-280을 PROD-267보다 먼저 머지한다. 이후 PROD-267 merge의 Docker Build가 새 migration runner로 pending Plain Text cutover migration을 적용한다.

Rollback은 PROD-280 코드와 Job/workflow를 revert하는 방식이다. 이미 적용된 domain migration은 자동으로 되돌리지 않으며, schema/data rollback은 각 migration의 별도 운영 판단에 따른다.

## Open Questions

없음.
