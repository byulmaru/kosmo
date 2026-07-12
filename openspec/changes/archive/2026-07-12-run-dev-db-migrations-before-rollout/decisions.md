## Context

이 기록은 PROD-280의 Linear 범위, `dev-database-migrations` spec, 현재 Docker Build → Deploy Dev → Argo Rollout restart 경로와 사용자 논의를 반영한다. dev는 `latest`와 허용된 downtime을 유지하고, production migration 정책은 PROD-269가 별도로 소유한다.

## Decision Records

### Dev는 `latest` image와 downtime 허용 정책을 유지한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: production에서는 migration과 workload를 같은 immutable release로 묶어야 하지만 현재 dev는 빠른 반복을 위해 `latest` restart를 사용하고 downtime이 문제되지 않는다.
- Decision Outcome: PROD-280은 dev의 `latest` image reference를 유지하고 migration 직후 기존 workload가 잠시 실패할 수 있음을 허용한다. 기존 data는 reset하지 않고 version-controlled migration으로 보존한다.
- Alternatives Considered: dev도 SHA/digest로 전환하는 방식은 production release identity 설계와 결합돼 현재 범위를 키운다. DB reset은 migration 보존 계약을 검증하지 못하고 기존 dev data를 불필요하게 버린다.
- Consequences: dev는 무중단과 rollback compatibility를 보장하지 않는다. migration과 restart는 한 직렬 workflow에서 최대한 가깝게 실행한다.
- Confirmation / Follow-up: production immutable image와 expand/contract는 PROD-269에서 결정한다.

### 같은 runtime image의 독립 migration command와 Job을 사용한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: app startup migration은 pod 수만큼 경쟁하고 initContainer는 rollout 중 모든 pod에서 반복되며, 별도 migration image는 같은 release의 code와 SQL이 어긋날 수 있다.
- Decision Outcome: runtime image에 migration SQL과 `migrate` command를 포함하고, Argo CD가 app container와 분리된 단일 Kubernetes Job으로 실행한다.
- Alternatives Considered: startup migration과 initContainer는 중복 실행과 rollout 결합 때문에 제외한다. 별도 image는 build/promotion surface를 늘린다. GitHub runner에서 직접 DB에 연결하면 cluster-local DB credential과 network 경계를 CI에 노출한다.
- Consequences: Dockerfile과 entrypoint가 migration runtime도 소유한다. Job은 workload와 같은 image와 DB secret을 사용한다.
- Confirmation / Follow-up: container command, Helm render와 disposable PostgreSQL 실행으로 검증한다.

### GitHub Actions가 full sync를 시작하고 Argo PreSync가 rollout을 gate한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: 현재 Deploy Dev는 Argo Rollout restart action만 실행하므로 hook이 실행될 application sync 경계가 없다.
- Decision Outcome: Docker Build 완료 workflow가 `argocd app sync kosmo-dev`를 실행하고, `PreSync` migration Job 성공 뒤에만 기존 API/web restart action을 실행한다. migration-aware deploy는 취소하지 않고 직렬화한다.
- Alternatives Considered: GitHub Actions가 Kubernetes Job을 직접 생성하면 cluster credential과 imperative manifest 관리가 추가된다. `PostSync` destructive migration은 rollback 대상 workload를 깨뜨린다. selective sync는 hook을 실행하지 않는다.
- Consequences: Argo sync 실패가 workflow 실패로 전파되고 restart step은 실행되지 않는다. 현재 Argo application이 full sync hook을 실행할 수 있어야 한다.
- Confirmation / Follow-up: workflow ordering과 실패 short-circuit를 정적 검증하고 dev 최초 배포에서 hook 실행을 확인한다.

### Drizzle history와 PostgreSQL advisory lock만 사용한다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: 설치된 Drizzle migrator는 pending migration과 history transaction을 처리하지만 concurrent runner coordination을 제공하지 않는다.
- Decision Outcome: 별도 migration history system을 만들지 않고 Drizzle `__drizzle_migrations`를 사용한다. runner는 단일 connection session에서 `pg_try_advisory_lock`을 획득하고 실패하면 즉시 종료한다.
- Alternatives Considered: custom history/checksum table은 Drizzle 기능을 중복한다. blocking lock은 잘못 시작된 Job이 무기한 대기할 수 있다. lock 없이 Job 수만 1로 제한하면 서로 다른 deploy run 간 경쟁을 막지 못한다.
- Consequences: migration runner connection pool은 1이고 lock key는 repository에서 고정한다. Job은 자동 retry하지 않는다.
- Confirmation / Follow-up: 최초 적용, no-op 재실행과 lock contention을 test PostgreSQL에서 검증한다.

### 배포 후 smoke는 포함하지 않는다

- Decision Date: 2026-07-12
- Status: Accepted
- Context / Problem: 현재 `/health`는 변경된 domain column을 확인하지 않고, 인증된 end-to-end smoke는 test identity와 실제 data mutation을 요구한다.
- Decision Outcome: PROD-280의 배포 성공 조건은 migration Job 성공과 Argo sync/restart command 성공으로 제한한다.
- Alternatives Considered: `/health`만 추가 호출하면 DB schema compatibility 근거가 약하다. 게시글 작성 smoke는 이번 최소 migration 경계를 넘어선다.
- Consequences: 배포 후 사용자 흐름 검증은 기존 CI와 수동 dev 확인에 남는다.
- Confirmation / Follow-up: 실제 필요가 확인되면 별도 issue로 read-only readiness 또는 deploy smoke를 설계한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
