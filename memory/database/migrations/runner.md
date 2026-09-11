# Database Migration Workflow: Drizzle Runner

## Current Drizzle Runner Boundary

현재 `migrate` command는 runtime image의 `drizzle/` 아래에서 공개 Drizzle migration reader로 파일을
version-control 순서대로 읽는다. `drizzle.__drizzle_migrations` history의 각 적용 name이 local migration에
존재하고 hash가 같은지 검증한 뒤, 이미 적용된 name을 제외한 pending 파일을 version-control 순서로 파일마다
독립 transaction으로 적용한다. 병렬 branch가 timestamp와 다른 순서로 merge·배포되어 DB 적용 순서가 local
정렬과 달라도 같은 name/hash 집합이면 유효하다. Local에 없는 history, 같은 name의 hash 변경과 중복
name/history는 새 SQL 실행 전에 거부한다.
각 파일의 모든 statement와 history insert가 같은 transaction에 있으므로 파일 성공은 함께 commit되고 파일
실패는 함께 rollback된다. PostgreSQL advisory lock은 동시 runner를 막지만 migration phase를 선택하지 않는다.
Dev와 production은 PostgreSQL Cluster가 생성한 `<cluster>-app` Secret의 `password`로 schema/database owner
`kosmo`에 직접 로그인해 migration을 실행한다. Production Cluster `kosmo-postgres`의 Secret은
`kosmo-postgres-app`이며 `PGUSER=kosmo`를 고정한다. Runtime은 `kosmo_runtime` credential을 사용하고,
별도 `kosmo_migration` login, Vault/VSO migration source, `DATABASE_MIGRATION_ROLE` 또는 `SET ROLE` 경계를
사용하지 않는다. Owner `kosmo`의 LOGIN, CNPG-managed password와 기존 database/schema/table ownership은
유지한다.

Production 전환 전에는 latest backup/WAL, active owner connection drain, current workload readiness와 owner Secret
consumer를 read-only로 확인하고 별도 `prod` Environment 승인을 받은 뒤에만 credential consumer와 database role을
변경한다. 전환 후에는 migration 성공, CNPG/catalog 상태, active workload principal과 obsolete identity 부재를
postflight로 검증한다. replicas=0인 controller-retained historical owner ReplicaSet은 삭제하거나 revision history를
축소하지 않으며, 지원되는 rollback 대상에서 제외하고 재활성화 시 owner credential을 다시 소비할 수 있는 잔여
위험을 기록한다.

따라서 다음 규칙을 지킨다.

- Drizzle history에 기록된 migration의 directory name이나 SQL을 수정, 이동 또는 재생성하지 않는다. 이미 적용된
  migration의 오류는 새 forward migration으로 수정한다.
- 중간 파일이 실패해도 앞서 성공한 파일과 history는 유지한다. 실패한 파일 뒤의 파일은 실행하지 않으며, 원인을
  수정한 새 release는 이미 적용된 name/hash를 건너뛰고 아직 적용되지 않은 파일만 version-control 순서로 재시도한다.
- 적용 순서가 local timestamp 정렬과 다르다는 이유로 history row를 재정렬하거나 다시 기록하지 않는다.
- expand와 contract migration을 같은 transition image에 포함하지 않는다.
- 아직 실행하면 안 되는 contract SQL을 미리 commit한 뒤 현재 runner가 알아서 건너뛸 것이라고 기대하지 않는다.
- 단순한 breaking change는 phase-aware custom runner보다 PR/release 분리를 우선한다.
- Production migration은 owner 직접 로그인과 immutable release의 preflight → 승인 → migration success barrier →
  workload activation → postflight 순서를 유지한다. Preflight/postflight evidence만으로 사람 승인을 대체하지 않는다.
- 별도 pre/post folder, history table 또는 phase selector는 반복되는 운영 필요와 recovery 계약이 확인된 뒤
  PROD-269 범위에서 설계한다.
- dev의 mutable `latest`와 downtime 허용 예외를 production migration의 선례로 사용하지 않는다.
