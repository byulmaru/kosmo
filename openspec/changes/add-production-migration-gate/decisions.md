## Context

이 기록은 Linear PROD-564, PROD-269, PROD-546, 저장소의 production migration 정책과 현재 dev migration runner/Helm/backup runbook을 반영한다. PROD-564는 generic production migration gate를 소유하지만 production runtime, 일반 release pipeline, 특정 schema migration과 실제 첫 release는 소유하지 않는다.

## Decision Records

### Migration과 workload는 같은 immutable digest를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-564`, `PROD-269`
- Status: Active
- Context / Problem: Mutable tag 또는 서로 다른 build를 사용하면 검토한 migration SQL과 실제 workload code의 identity가 달라질 수 있다.
- Decision Outcome: Migration Job, API와 Web은 승인된 하나의 `image@sha256:...` identity를 사용하며 gate는 tag-only reference와 digest 불일치를 거부한다.
- Alternatives Considered: SemVer, `stable` 또는 SHA tag 비교는 registry tag 이동 가능성을 제거하지 못해 제외했다. 별도 migration image는 release identity surface를 늘려 제외했다.
- Consequences: PROD-563 pipeline은 같은 digest를 gate input과 workload 배포에 전달해야 한다.
- Confirmation / Follow-up: Helm render와 gate fixture에서 동일 digest 성공, tag-only와 mismatch 실패를 검증한다.

### Production migration credential은 runtime credential과 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-564`
- Status: Active
- Context / Problem: Application runtime에 DDL 권한을 주거나 migration 장애 시 runtime credential로 fallback하면 최소 권한 경계가 사라진다.
- Decision Outcome: Production migration Job은 별도 Secret/database identity만 사용하고 API/Web은 이를 참조하지 않는다. Credential이 없거나 유효하지 않으면 SQL 실행 전에 실패하며 fallback하지 않는다.
- Alternatives Considered: CNPG application Secret 재사용은 runtime DDL 권한을 요구해 제외했다. GitHub runner에 database credential을 전달하는 방식은 cluster-local secret과 network 경계를 넓혀 제외했다.
- Consequences: PROD-562 runtime foundation과 독립적으로 연결 가능한 migration Secret interface가 필요하고 실제 credential lifecycle은 해당 infrastructure 경계를 따라야 한다.
- Confirmation / Follow-up: Prod render와 failure fixture에서 Secret 분리, runtime 미노출과 fail-closed를 확인한다.

### Phase는 runner selector가 아니라 release metadata와 image 분리로 강제한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-564`, `PROD-269`; repository policy `memory/database-migrations.md`
- Status: Active
- Context / Problem: 현재 Drizzle runner는 pending migration 전체를 적용하며 별도 phase history가 없다. Custom phase selector는 recovery와 history 계약을 새로 만들어야 한다.
- Decision Outcome: 각 production release는 `expand`, `transition`, `contract` phase와 schema-change authority를 선언하고, image에는 그 phase에서 안전한 migration만 포함한다. 기존 Drizzle history와 advisory lock은 유지한다.
- Alternatives Considered: migration directory를 phase별로 나누거나 custom history table을 추가하는 방식은 현재 범위를 넘어 제외했다. Transition image에 contract SQL을 미리 포함하는 방식은 현 runner가 즉시 실행하므로 금지한다.
- Consequences: Breaking schema 변경은 phase별 PR/release로 나뉘어야 하고 잘못 구성된 image는 gate metadata만으로 안전해지지 않는다.
- Confirmation / Follow-up: Phase 입력 검증과 contract SQL 사전 포함 금지를 runbook/test fixture로 확인한다.

### Contract는 migration 직전 복구 가능성을 증명한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-564`, `PROD-546`; repository operations `docs/operations/postgres-backup.md`
- Status: Superseded
- Context / Problem: 일일 base backup의 경과 시간은 recovery chain의 시작점과 RTO에는 영향을 줄 수 있지만, 연속 WAL이 존재하면 그 자체가 migration 직전 복구 가능성을 결정하지 않는다. 반대로 최근 base backup만 있어도 WAL chain이 끊겼다면 contract 직전으로 복구할 수 없다.
- Decision Outcome: Contract gate는 recovery window 안의 성공한 base backup, 그 이후의 연속 WAL archive와 overdue가 아닌 월간 restore rehearsal evidence를 확인한다. Contract 실행 직전에는 고유한 named restore point를 만들고 해당 target WAL이 backup 저장소에 archive된 뒤에만 migration을 실행한다. 일일 base backup 지연은 이 recovery chain이 유효한 한 migration 차단 조건으로 중복하지 않는다.
- Alternatives Considered: 24시간에 고정 유예를 더한 backup age 기준은 backup 운영 이상과 migration 복구 가능성을 과도하게 결합해 제외했다. 매 contract마다 새 base backup 또는 restore rehearsal을 실행하는 방식은 연속 WAL과 월간 rehearsal을 중복하고 release latency를 크게 늘려 제외했다. Evidence 문자열 존재만 확인하는 방식은 실제 recovery chain을 증명하지 못해 제외했다.
- Consequences: Gate는 backup 생성이나 restore rehearsal을 직접 실행하지 않지만, restore point 생성과 target WAL archive 확인이 끝날 때까지 contract를 기다린다. 일일 backup 누락은 PROD-546 운영 이상으로 별도 처리하며 recovery window, WAL 연속성 또는 RTO evidence를 깨뜨리면 결과적으로 contract도 차단된다.
- Confirmation / Follow-up: 2026-07-30 사용자 결정과 갱신된 Linear `PROD-564`에 따라 아래 target LSN evidence 결정으로 대체됐다.

### Contract는 target LSN과 정확한 WAL archive evidence를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-564`, `PROD-546`; repository operations `docs/operations/postgres-backup.md`
- Status: Active
- Context / Problem: CloudNativePG는 PostgreSQL이 미리 생성한 named restore point를 PITR target으로 소비할 수 있지만 restore point 생성 자체를 제공하지 않는다. 전용 command를 migration image와 Helm Job에 추가하면 migration 실행, recovery evidence 수집과 release gate 책임이 결합된다. 또한 `pg_stat_archiver.last_archived_wal`의 순서 비교는 promotion이나 crash recovery에서 정확한 target WAL의 archive를 증명하지 못한다.
- Decision Outcome: Contract 실행 직전에 production primary의 현재 WAL LSN과 대응 WAL identity를 캡처하고, PROD-546 backup 경계가 그 정확한 WAL의 archive를 검증한 evidence를 gate가 소비한다. 복구 시 CloudNativePG의 `recoveryTarget.targetLSN`을 사용한다. Named restore point command와 별도 restore-point Job은 만들지 않는다.
- Alternatives Considered: `pg_create_restore_point()`는 사람이 읽기 쉬운 이름을 제공하지만 별도 함수 권한과 image command를 요구해 제외했다. `last_archived_wal >= targetWal` 비교는 archive 순서를 가정하므로 제외했다. Migration 직전 새 base backup은 연속 WAL recovery chain을 중복하고 release latency를 늘려 제외했다.
- Consequences: Migration Job은 `migrate`, 동일 digest와 전용 DB Secret만 책임진다. Target LSN capture와 정확한 archive evidence 수집 연결은 PROD-563 pipeline 및 PROD-546 backup interface 경계에서 수행하며, PROD-564 gate는 비민감 evidence의 일치와 freshness를 검증한다.
- Confirmation / Follow-up: Base backup age만 지난 유효 chain은 통과하고, missing base, 끊긴 WAL, overdue rehearsal, 잘못된 LSN 형식과 target/archive WAL 불일치는 실패하는 fixture를 검증한다. Helm render에 restore-point command, phase 또는 schema-authority 분기가 없는지 검증한다.

### Contract compatibility는 live workload와 승인된 digest allowlist를 대조한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-564`, `PROD-269`; repository policy `memory/database-migrations.md`
- Status: Active
- Context / Problem: Rollout status 성공이나 non-current workload scale 0만으로 해당 version이 contract schema와 호환되거나 rollback 대상에서 제외됐음을 증명할 수 없다.
- Decision Outcome: 특정 schema-change authority가 승인한 compatibility digest allowlist와 rollback window 종료 시각을 gate input으로 제공한다. Gate는 active, preview와 rollback 대상으로 분류된 live workload identity를 조회해 allowlist 밖 digest 또는 아직 열린 window가 있으면 실패한다.
- Alternatives Considered: 현재 Pod만 확인하면 preview/rollback target을 놓쳐 제외했다. 모든 non-current ReplicaSet 존재를 무조건 실패시키면 호환되는 release와 보존 history도 차단해 제외했다.
- Consequences: 특정 migration owner가 compatible release identity와 rollback window를 정확히 기록해야 한다. Gate는 compatibility 판단 자체가 아니라 승인된 evidence와 live state의 일치를 검증한다.
- Confirmation / Follow-up: Active/preview/rollback fixture 각각에 대해 compatible success와 old digest/window failure를 검증한다.

### Contract는 별도 protected approval 경계를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-564`, `PROD-269`
- Status: Superseded
- Context / Problem: 일반 production release 승인은 destructive schema contract의 backup, compatibility와 rollback 영향 검토를 대신하지 못한다.
- Decision Outcome: Contract 자동 gate 뒤 별도 protected GitHub environment/job 승인을 요구한다. Expand/transition과 일반 release 승인 UI는 그대로 두고 contract path만 강화한다.
- Alternatives Considered: 일반 production approval 재사용은 destructive 의도를 구분하지 못해 제외했다. Repository 안 boolean input만으로 승인하면 권한 분리가 없어 제외했다.
- Consequences: Repository environment reviewer 설정이 prerequisite이며 미구성 상태에서는 contract execution이 fail-closed여야 한다.
- Confirmation / Follow-up: 2026-07-30 사용자 결정과 갱신된 Linear `PROD-563`, `PROD-564`에 따라 아래 단일 production release 승인 결정으로 대체됐다.

### Production release 승인 하나가 migration과 workload를 함께 승인한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-563`, `PROD-564`
- Status: Active
- Context / Problem: 정식 SemVer release image에는 실행할 migration과 API/Web code가 함께 들어 있으며 production 배포 승인은 이 release 전체를 선택하는 행위다. Contract migration만 다시 승인하면 같은 release에 중복 승인 경계가 생기고 실제 migration 실행과 승인 workflow가 분리된다.
- Decision Outcome: PROD-563의 production release 승인은 선택한 immutable image의 migration과 API/Web workload를 한 번에 승인한다. PROD-564는 그 승인 뒤 phase, recovery evidence, compatibility와 rollback window를 자동 검증하며 contract 전용 Environment, approval workflow 또는 boolean approval input을 추가하지 않는다.
- Alternatives Considered: Contract 전용 protected Environment는 destructive 의도를 별도로 드러내지만 동일 release를 두 번 승인하고 migration 실행 job과 결합하기 어렵기 때문에 제외했다. 승인 없는 자동 production 배포도 제외하며 production release 자체의 Environment 경계는 PROD-563에 유지한다.
- Consequences: Contract의 강화된 안전성은 별도 사람 승인 횟수가 아니라 schema authority, target LSN WAL archive evidence, live workload allowlist와 rollback window의 fail-closed 자동 검사로 제공한다.
- Confirmation / Follow-up: Gate fixture에서 approval input 없이 contract 자동 조건만 검증하고, PROD-563 pipeline이 production approval 전에는 migration을 실행하지 않는지 해당 이슈에서 검증한다.

### 실패 후 database rollback을 자동 실행하지 않는다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-564`; repository policy `memory/database-migrations.md`
- Status: Active
- Context / Problem: 임의 down migration은 부분 적용, 데이터 손실과 새로운 compatibility 위반을 만들 수 있다.
- Decision Outcome: Migration 실패는 workload activation을 중단한다. 운영자는 같은 digest 재시도, 새 forward migration 또는 승인된 restore 중 하나를 선택하며 gate는 database rollback을 자동 실행하지 않는다.
- Alternatives Considered: 자동 down migration은 모든 migration에 안전한 inverse가 없고 backup/restore 승인 경계를 우회해 제외했다.
- Consequences: Runbook에 failure classification과 recovery 선택 기준이 필요하다.
- Confirmation / Follow-up: Migration failure fixture에서 activation 중단, no automatic rollback과 same-digest retry를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `Contract는 별도 protected approval 경계를 사용한다` — 2026-07-30 사용자 결정과 Linear `PROD-563`, `PROD-564` 정정으로 superseded.
- `Contract는 migration 직전 복구 가능성을 증명한다`의 named restore point 방식 — 2026-07-30 사용자 결정과 Linear `PROD-564` 정정으로 target LSN evidence 방식에 의해 superseded.
