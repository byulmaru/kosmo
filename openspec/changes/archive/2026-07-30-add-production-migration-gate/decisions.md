## Context

이 기록은 Linear PROD-564, PROD-269와 저장소 migration policy를 반영한다. PROD-564는 production migration의 공통 실행 경계만 소유한다.

## Decision Records

### Migration과 workload는 같은 immutable digest를 사용한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-564`, `PROD-269`
- Status: Active
- Context / Problem: 서로 다른 build를 사용하면 검토한 migration SQL과 실제 workload code의 identity가 달라질 수 있다.
- Decision Outcome: Migration Job과 모든 활성화 workload는 승인된 하나의 `image@sha256:...` identity를 사용한다.
- Alternatives Considered: SemVer, `stable` 또는 Git SHA tag 비교는 registry tag 이동 가능성을 제거하지 못해 제외했다. 별도 migration image는 release identity surface를 늘려 제외했다.
- Consequences: PROD-563 pipeline은 같은 digest를 migration과 workload 배포에 전달해야 한다.
- Confirmation / Follow-up: Helm render에서 동일 digest 성공과 invalid digest 실패를 검증한다.

### Production migration credential은 runtime credential과 분리한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-564`
- Status: Active
- Context / Problem: Application runtime에 DDL 권한을 주거나 migration 장애 시 runtime credential로 fallback하면 최소 권한 경계가 사라진다.
- Decision Outcome: Production migration Job은 별도 Secret/database identity만 사용하고 runtime workload는 이를 참조하지 않는다. Secret에서는 `username`과 `password`만 읽으며 접속 대상은 현재 Helm release의 PostgreSQL read-write Service와 `kosmo` database로 고정한다.
- Alternatives Considered: CNPG application Secret 재사용은 runtime DDL 권한을 요구해 제외했다. GitHub runner에 database credential을 전달하면 cluster-local secret 경계가 넓어져 제외했다.
- Consequences: PROD-562가 migration Secret을 제공하며 누락되거나 유효하지 않으면 migration은 실패한다.
- Confirmation / Follow-up: Prod render에서 고정된 접속 대상, Secret 분리, runtime 미노출과 missing credential failure를 검증한다.

### Migration Job은 migrate만 실행한다

- Decision Date: 2026-07-30
- Decision Class: Implementation Choice
- Authority / Provenance: Linear `PROD-564`; repository policy `memory/database-migrations.md`
- Status: Active
- Context / Problem: Phase, schema authority, restore point와 recovery evidence를 공통 Helm Job에 넣으면 실제 SQL 실행과 schema-change별 safety 판단이 결합된다.
- Decision Outcome: Production migration Job은 기존 Drizzle `migrate` command만 실행한다. Generic phase/evidence validator와 collector는 만들지 않는다.
- Alternatives Considered: 모든 release가 phase와 evidence JSON을 제공하는 generic gate는 provider interface와 운영 복잡성을 만들고 구체 migration별 조건을 정확히 표현하지 못해 제외했다.
- Consequences: 실제 destructive migration의 backup/restore, compatibility와 rollback gate는 해당 schema migration 이슈·PR·release가 소유한다.
- Confirmation / Follow-up: Helm render에 command/phase/schema-authority/restore 분기가 없는지 검증한다.

### Production release 승인 하나가 migration과 workload를 함께 승인한다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-563`, `PROD-564`
- Status: Active
- Context / Problem: Production tag가 선택한 image에는 migration과 workload가 함께 있다.
- Decision Outcome: PROD-563의 production release 승인 하나가 migration과 모든 활성화 workload에 적용된다. Migration 성공 뒤에만 workload를 활성화하며 migration 전용 추가 승인은 만들지 않는다.
- Alternatives Considered: Contract 전용 Environment는 같은 release를 중복 승인해 제외했다.
- Consequences: Job failure가 workload activation barrier가 된다.
- Confirmation / Follow-up: PROD-563 pipeline과 PROD-565 첫 release에서 통합 검증한다.

### 실패 후 database rollback을 자동 실행하지 않는다

- Decision Date: 2026-07-30
- Decision Class: Derived Contract
- Authority / Provenance: Linear `PROD-564`; repository policy `memory/database-migrations.md`
- Status: Active
- Context / Problem: 임의 down migration은 부분 적용과 데이터 손실을 만들 수 있다.
- Decision Outcome: Migration 실패는 workload activation을 중단한다. 운영자는 같은 release 재시도 또는 새 forward migration을 사용하며 database rollback을 자동 실행하지 않는다.
- Alternatives Considered: 자동 down migration은 모든 migration에 안전한 inverse가 없어 제외했다.
- Consequences: Runbook에 failure classification과 recovery 경계를 기록한다.
- Confirmation / Follow-up: Migration failure 뒤 activation이 중단되는지 PROD-563에서 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- Generic phase/schema-authority metadata와 backup/restore, workload compatibility, rollback window를 하나의 JSON gate로 검증하는 방식 — 2026-07-30 사용자 단순화 결정과 Linear `PROD-564` 범위 축소로 superseded.
- Named restore point 또는 target LSN collector를 공통 production migration gate에 포함하는 방식 — 실제 destructive schema migration 이슈·PR·release가 구체 evidence를 소유하도록 변경돼 superseded.
- Contract 전용 protected approval 경계 — production release 단일 승인 결정으로 superseded.
