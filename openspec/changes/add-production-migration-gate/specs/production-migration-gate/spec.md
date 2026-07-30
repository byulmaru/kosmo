## ADDED Requirements

### Requirement: 분리된 production migration 권한

**Authority / Provenance:** `PROD-564`, `memory/database-migrations.md`. Production migration Job은 schema migration에 필요한 별도 database identity와 credential을 사용해야 하며(MUST), API와 Web runtime credential을 사용하거나 migration credential이 없을 때 runtime credential로 fallback해서는 안 된다(MUST NOT).

#### Scenario: Migration credential로 실행

- **WHEN** production migration Job이 시작된다
- **THEN** Job은 production migration 전용 Secret과 database identity로 연결한다
- **AND** API와 Web workload는 같은 credential을 mount하거나 참조하지 않는다

#### Scenario: Migration credential 준비 실패

- **WHEN** migration 전용 Secret이 없거나 유효한 database 연결을 만들 수 없다
- **THEN** migration Job은 SQL을 실행하지 않고 실패한다
- **AND** runtime credential로 재시도하지 않는다

### Requirement: 동일한 immutable release identity

**Authority / Provenance:** `PROD-564`, `PROD-269`. Production migration Job, API와 Web workload는 승인된 release의 동일한 immutable image digest를 사용해야 한다(MUST). Mutable tag 또는 서로 다른 digest가 발견되면 migration을 시작하거나 새 workload를 활성화해서는 안 된다(MUST NOT).

#### Scenario: 동일 digest 검증

- **WHEN** production migration gate가 release를 검증한다
- **THEN** migration Job, API와 Web의 rendered image reference가 승인된 digest와 정확히 일치한다

#### Scenario: Mutable 또는 불일치 image 거부

- **WHEN** migration 또는 workload image가 tag만 사용하거나 승인된 digest와 다르다
- **THEN** gate는 migration 실행 전에 실패한다

### Requirement: 명시적인 migration phase

**Authority / Provenance:** `PROD-564`, `PROD-269`, `memory/database-migrations.md`. 모든 production migration 실행은 `expand`, `transition`, `contract` 중 하나의 phase와 해당 schema-change authority reference를 명시해야 한다(MUST). Gate는 알 수 없는 phase, 누락된 authority 또는 승인되지 않은 phase를 거부해야 한다(MUST).

#### Scenario: Expand 또는 transition release

- **WHEN** 승인된 release가 `expand` 또는 `transition` phase를 선언한다
- **THEN** gate는 contract 전용 승인과 destructive evidence gate를 요구하지 않는다
- **AND** release image에는 현재 phase에서 실행 가능한 migration만 포함되어야 한다

#### Scenario: Contract release

- **WHEN** 승인된 release가 `contract` phase를 선언한다
- **THEN** gate는 backup/restore evidence, workload compatibility, rollback window 종료와 contract 전용 승인을 모두 통과한 뒤에만 migration을 실행할 수 있다

#### Scenario: Phase가 없는 release

- **WHEN** production release가 phase 또는 schema-change authority를 제공하지 않는다
- **THEN** gate는 migration을 실행하지 않고 실패한다

### Requirement: Contract backup과 restore evidence gate

**Authority / Provenance:** `PROD-564`, `PROD-546`, `docs/operations/postgres-backup.md`. Contract migration은 유효한 base backup부터 migration 직전 복구 지점까지 이어지는 WAL recovery chain과 overdue가 아닌 성공한 격리 restore rehearsal 증거를 확인해야 한다(MUST). Gate는 backup/restore를 직접 구현하지 않으며 PROD-546이 생성한 비민감 증거를 소비해야 한다(MUST).

#### Scenario: 유효한 recovery chain과 restore evidence

- **WHEN** recovery window 안의 성공한 base backup과 그 이후의 연속 WAL archive가 존재하고 월간 restore rehearsal이 성공 상태이며 overdue가 아니다
- **THEN** contract gate는 migration 직전 복구 지점 생성을 진행할 수 있다

#### Scenario: Migration 직전 복구 지점 보존

- **WHEN** contract의 다른 자동 조건이 충족돼 migration 실행을 준비한다
- **THEN** gate는 production database에 고유한 named restore point를 생성한다
- **AND** 해당 restore point를 포함하는 target WAL이 backup 저장소에 archive됐음을 확인한 뒤에만 contract 승인을 진행한다

#### Scenario: Recovery chain이 유효하지 않음

- **WHEN** 복구를 시작할 base backup이 recovery window 안에 없거나 WAL chain이 끊겼거나 restore point의 target WAL archive를 확인할 수 없다
- **THEN** gate는 contract migration을 차단한다

#### Scenario: Restore rehearsal이 overdue임

- **WHEN** 성공한 restore rehearsal evidence가 없거나 월간 운영 주기에서 overdue 상태다
- **THEN** gate는 contract migration을 차단한다

#### Scenario: 일일 base backup 지연만 발생함

- **WHEN** 가장 최근 예정된 일일 base backup이 지연됐지만 기존 base backup과 연속 WAL로 migration 직전 restore point까지 복구할 수 있고 restore rehearsal도 overdue가 아니다
- **THEN** gate는 base backup의 경과 시간만을 이유로 contract migration을 차단하지 않는다
- **AND** 일일 backup 지연은 PROD-546의 별도 운영 이상으로 유지한다

### Requirement: 구버전 workload compatibility와 rollback window

**Authority / Provenance:** `PROD-564`, `PROD-269`, `memory/database-migrations.md`. Contract migration은 active, preview와 rollback 대상으로 분류된 production workload의 immutable image identity를 조회하고, 승인된 compatibility evidence에 포함되지 않은 workload가 하나라도 남아 있으면 실행되어서는 안 된다(MUST NOT). Schema-change authority가 정한 rollback window도 종료되어야 한다(MUST).

#### Scenario: 호환되는 workload만 존재

- **WHEN** active, preview와 rollback 대상 workload의 image digest가 모두 승인된 compatibility allowlist에 있고 rollback window 종료 시각이 지났다
- **THEN** workload compatibility gate는 통과한다

#### Scenario: 구버전 workload가 남음

- **WHEN** active, preview 또는 rollback 대상에 compatibility allowlist 밖의 image digest가 하나라도 존재한다
- **THEN** gate는 contract migration을 차단하고 발견한 workload identity를 비민감 진단 정보로 남긴다

#### Scenario: Rollback window가 열려 있음

- **WHEN** 현재 시각이 schema-change authority가 승인한 rollback window 종료 시각보다 이르다
- **THEN** gate는 contract migration을 차단한다

### Requirement: Contract 전용 승인

**Authority / Provenance:** `PROD-564`, `PROD-269`. Contract migration은 일반 production release 승인과 분리된 보호된 승인 경계를 통과해야 한다(MUST). Expand 또는 transition 실행에 contract 승인을 재사용해서는 안 된다(MUST NOT).

#### Scenario: Contract 승인 완료

- **WHEN** 모든 자동 gate가 성공하고 contract 전용 승인자가 해당 evidence와 release identity를 승인한다
- **THEN** 같은 승인 context에서 contract migration Job을 시작할 수 있다

#### Scenario: Contract 승인 없음

- **WHEN** 자동 gate가 성공했지만 contract 전용 승인이 완료되지 않았다
- **THEN** contract migration Job은 시작되지 않는다

### Requirement: Migration 실패 시 workload 활성화 차단

**Authority / Provenance:** `PROD-564`, `memory/database-migrations.md`. Production migration이 실패하면 해당 release의 새 API와 Web workload를 활성화해서는 안 된다(MUST NOT). 운영자는 실패한 release identity와 phase를 보존한 채 재시도 또는 forward recovery를 선택할 수 있어야 하며(MUST), 시스템은 database rollback을 자동 실행해서는 안 된다(MUST NOT).

#### Scenario: Migration 성공

- **WHEN** production migration Job이 성공하고 Drizzle history에 적용 결과가 기록된다
- **THEN** gate는 같은 immutable release의 workload 활성화를 후속 단계에 허용한다

#### Scenario: Migration 실패

- **WHEN** credential, preflight, SQL, advisory lock 또는 timeout으로 migration Job이 실패한다
- **THEN** 새 workload 활성화는 실행되지 않는다
- **AND** 실패한 migration을 적용 완료로 기록하거나 database rollback을 자동 실행하지 않는다

#### Scenario: 안전한 재시도

- **WHEN** 운영자가 원인을 해결하고 migration을 재시도한다
- **THEN** 재시도는 같은 immutable release identity와 승인된 phase/evidence를 사용한다
- **AND** credential, secret 값과 database row 내용은 workflow log에 출력되지 않는다
