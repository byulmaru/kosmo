## 1. PROD-564 Production migration과 contract gate

**Authority / Provenance**

- `PROD-564`
- `PROD-269`
- `PROD-546`
- `memory/database-migrations.md`
- `docs/operations/postgres-backup.md`

**Deliverable**

Production release가 별도 migration credential과 workload와 같은 immutable digest로 migration을 실행하며, contract phase는 production release 승인 뒤 현재 backup/restore evidence, workload compatibility와 rollback window를 모두 통과할 때만 실행되고 migration 실패 시 새 workload 활성화가 차단된다.

**Guardrails**

- 특정 schema migration, backfill, S3/PITR 구현과 database 자동 rollback을 추가하지 않는다.
- PROD-562 production runtime, PROD-563 일반 release pipeline과 승인 UI, PROD-565 실제 첫 release/public smoke를 구현하지 않는다.
- 기존 Drizzle history와 advisory lock을 유지하고 phase-aware custom runner나 별도 migration history를 만들지 않는다.
- Contract SQL은 transition image에 포함하지 않으며 phase별 PR/release 분리를 유지한다.
- Secret, connection string, backup object key와 database row 값은 repository, artifact 또는 workflow log에 남기지 않는다.

**Verification**

- OpenSpec strict validation과 repository format/lint를 통과한다.
- Helm dev/prod render에서 production migration Job의 별도 credential, digest identity와 dev 회귀를 검증한다.
- Gate fixture에서 phase, digest, recovery chain, rehearsal overdue 상태, target LSN과 정확한 WAL archive evidence, workload identity와 rollback window 성공/실패 경로를 검증한다.
- Helm migration Job이 `migrate`, 동일 digest와 전용 Secret만 책임지고 restore-point command, phase 또는 schema-authority 분기를 갖지 않는지 검증한다.
- Contract 전용 Environment, approval workflow 또는 수동 approval input이 없고 PROD-563의 production release 승인 하나만 소비하는지 검증한다.
- Migration failure가 workload activation을 short-circuit하고 같은 digest 재시도만 허용하며 자동 database rollback을 실행하지 않는지 검증한다.
- Runbook의 입력·조회·실패·복구 명령이 실제 workflow/manifest interface와 일치하는지 검토한다.

- [x] 1.1 Immutable digest, phase, schema-change authority, rollback window, compatibility allowlist와 target LSN archive evidence를 받고 별도 approval input을 요구하지 않는 fail-closed migration gate interface를 구현한다.
- [x] 1.2 Production migration Job을 별도 migration Secret/database identity, API/Web과 동일 digest와 `migrate` command만 갖는 실행기로 단순화한다.
- [x] 1.3 `expand`/`transition`과 `contract`의 실행 조건을 분리하고 알 수 없거나 authority가 없는 phase를 거부한다.
- [x] 1.4 Contract 전에 유효한 base backup과 연속 WAL chain, overdue가 아닌 월간 restore rehearsal을 확인하고 migration 직전 target LSN에 대응하는 정확한 WAL archive evidence를 검증한다.
- [x] 1.5 Active/preview/rollback workload digest를 compatibility allowlist와 대조하고 rollback window가 끝나지 않았으면 차단한다.
- [x] 1.6 PROD-563의 단일 production release 승인을 전제로 contract 자동 gate를 실행하고 migration 성공만 호출자에게 workload activation 허용 결과로 반환한다.
- [x] 1.7 Credential/preflight/SQL/lock/timeout 실패, target LSN 기반 restore, 같은 digest 재시도와 forward recovery 판단 경계를 중복 contract 승인 없이 운영 runbook에 기록한다.
- [x] 1.8 Named restore point 구현을 제거하고 dev/prod render와 모든 gate failure fixture, test, lint, format과 OpenSpec strict validation을 통과한다.
- [x] 1.9 최신 Linear와 repository policy를 다시 대조해 PROD-562/563/565 범위가 포함되지 않았는지 확인한 뒤 PROD-564 구현 PR을 Ready로 갱신한다.
