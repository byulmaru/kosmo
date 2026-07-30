## ADDED Requirements

### Requirement: 분리된 production migration 권한

**Authority / Provenance:** `PROD-564`, `memory/database-migrations.md`. Production migration Job은 schema migration에 필요한 별도 database identity와 credential을 사용해야 하며(MUST), API와 Web runtime credential을 사용하거나 migration credential이 없을 때 runtime credential로 fallback해서는 안 된다(MUST NOT).

#### Scenario: Migration credential로 실행

- **WHEN** production migration Job이 시작된다
- **THEN** Job은 production migration 전용 Secret과 database identity로 연결한다
- **AND** 접속 대상은 현재 Helm release의 PostgreSQL read-write Service와 `kosmo` database로 고정된다
- **AND** API와 Web workload는 같은 credential을 mount하거나 참조하지 않는다

#### Scenario: Migration 대상 입력 금지

- **WHEN** production migration Job manifest가 렌더된다
- **THEN** database URL, host, database와 migration Secret 이름/key를 release 입력으로 받지 않는다
- **AND** migration Secret에서는 `username`과 `password`만 읽는다

#### Scenario: Migration credential 준비 실패

- **WHEN** migration 전용 Secret이 없거나 유효한 database 연결을 만들 수 없다
- **THEN** migration Job은 SQL을 실행하지 않고 실패한다
- **AND** runtime credential로 재시도하지 않는다

### Requirement: 동일한 immutable release identity

**Authority / Provenance:** `PROD-564`, `PROD-269`. Production migration Job, API와 Web workload는 승인된 release의 동일한 immutable image digest를 사용해야 한다(MUST). Mutable tag 또는 서로 다른 digest로 production migration을 실행해서는 안 된다(MUST NOT).

#### Scenario: 동일 digest로 렌더

- **WHEN** production release manifest가 렌더된다
- **THEN** migration Job, API와 Web image reference는 같은 `repository@sha256:...` 값이다

#### Scenario: Mutable production image 거부

- **WHEN** production migration이 tag-only image 또는 유효하지 않은 digest로 구성된다
- **THEN** manifest render는 migration Job을 생성하기 전에 실패한다

### Requirement: 단순한 migration 실행기

**Authority / Provenance:** `PROD-564`, `memory/database-migrations.md`. Production migration Job은 release image의 기존 Drizzle `migrate` command만 실행해야 한다(MUST). Generic phase selector, schema authority input, database target input, restore-point command 또는 backup/compatibility collector를 포함해서는 안 된다(MUST NOT).

#### Scenario: Production migration 실행

- **WHEN** production migration Job이 렌더된다
- **THEN** container argument는 `migrate`이다
- **AND** 기존 Drizzle history와 advisory lock 동작을 재사용한다

#### Scenario: Destructive migration 조건

- **WHEN** 실제 schema change가 contract migration을 포함한다
- **THEN** 해당 migration 이슈·PR·release가 backup/restore evidence, 구버전 workload compatibility와 rollback window를 구체적으로 정의하고 검증한다
- **AND** generic production migration Job은 이를 JSON metadata나 command mode로 추상화하지 않는다

### Requirement: Production release 단일 승인과 실패 차단

**Authority / Provenance:** `PROD-563`, `PROD-564`. 정식 production release 승인은 선택한 immutable image의 migration과 API/Web workload 전체에 한 번 적용되어야 한다(MUST). Migration이 성공하기 전에 같은 release의 새 workload를 활성화해서는 안 된다(MUST NOT).

#### Scenario: Migration 성공

- **WHEN** 승인된 production release의 migration Job이 성공한다
- **THEN** PROD-563 pipeline은 같은 immutable release의 API와 Web 활성화를 진행할 수 있다

#### Scenario: Migration 실패

- **WHEN** credential, SQL, advisory lock 또는 timeout으로 migration Job이 실패한다
- **THEN** 같은 release의 새 workload 활성화는 실행되지 않는다
- **AND** database rollback을 자동 실행하거나 migration을 적용 완료로 기록하지 않는다

#### Scenario: 중복 승인 금지

- **WHEN** production release가 승인됐다
- **THEN** migration만을 위한 별도 Environment 또는 추가 수동 승인을 요구하지 않는다
