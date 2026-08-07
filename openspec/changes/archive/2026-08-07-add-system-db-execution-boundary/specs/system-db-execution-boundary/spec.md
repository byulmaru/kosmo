## ADDED Requirements

### Requirement: System 작업은 명시적 DB execution context를 받는다

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-706`. 현재 production system 진입점인 web/federation은 system 작업마다 명시적인 DB handle을 가진 execution context를 생성하고 해당 작업에 전달해야 하며(SHALL), 별도 background/notification action도 같은 공통 execution 경계를 재사용할 수 있어야 한다(SHALL). 이 context 타입과 생성 경계는 API viewer context와 분리되어야 하며(SHALL), API 요청이 system context 또는 system role을 가장하는 공개 factory를 제공해서는 안 된다(SHALL NOT).

#### Scenario: Federation 요청 context 전달

- **WHEN** web runtime이 federation 요청을 처리한다
- **THEN** 해당 요청에만 생성된 system execution context가 federation handler 경계에 전달된다
- **AND** context는 기존 owner DB handle을 사용한다

#### Scenario: API viewer 경계 분리

- **WHEN** GraphQL API가 viewer 요청 context를 만든다
- **THEN** API context와 API가 import하는 public package surface는 system execution context factory나 system role 전환 기능을 노출하지 않는다

### Requirement: System action은 전달된 handle의 transaction 수명을 소유한다

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-706`. 원자적 DB 작업을 수행하는 system action은 전달된 DB handle에서 transaction을 열고 성공 시 commit하며 오류 시 rollback해야 한다(SHALL). 성공 또는 오류 뒤 transaction과 connection은 호출 경계를 벗어나 유지되거나 pool에서 누출되어서는 안 된다(SHALL NOT).

#### Scenario: System action 성공

- **WHEN** system action callback이 정상 완료된다
- **THEN** 전달 handle에서 연 transaction이 commit된다
- **AND** callback 결과가 호출자에게 반환된다
- **AND** 사용한 connection이 pool에 반환된다

#### Scenario: System action 오류

- **WHEN** system action callback이 오류를 던진다
- **THEN** 전달 handle에서 연 transaction이 rollback된다
- **AND** 같은 오류가 호출자에게 전파된다
- **AND** 사용한 connection이 pool에 반환된다

### Requirement: 공유 core service는 전달 DB handle을 선택할 수 있다

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-706`. 공유 core service의 database 선택 seam은 database handle과 caller-owned transaction handle을 모두 받을 수 있어야 한다(SHALL). handle이 전달되면 모든 service-owned transaction은 해당 handle에서 시작하거나 합류해야 하며(SHALL), handle이 없는 기존 호출자는 현재 전역 owner DB fallback과 SQL 결과를 유지해야 한다(SHALL).

#### Scenario: Database handle 전달

- **WHEN** caller가 공유 core service에 명시적 database handle을 전달한다
- **THEN** service는 전역 DB 대신 전달된 handle에서 service-owned transaction을 실행한다

#### Scenario: Caller transaction 전달

- **WHEN** caller가 공유 core service에 caller-owned transaction handle을 전달한다
- **THEN** service는 기존 savepoint·transaction composition 동작을 유지하며 해당 transaction에 합류한다

#### Scenario: 기존 호출자 호환

- **WHEN** 기존 caller가 DB handle 없이 공유 core service를 호출한다
- **THEN** service는 기존 전역 owner DB를 선택한다
- **AND** credential, SQL 결과와 오류 동작은 변경 전과 동일하다

### Requirement: 기반 변경은 후속 RLS slice와 독립적으로 배포된다

**Authority / Provenance:** `PROD-706`, `PROD-710`. execution boundary 배포는 특정 Post/Profile/Media SQL을 새 handle로 이전하거나 runtime credential, RLS policy·grant, owner credential과 ActivityPub 제품 행동을 변경해서는 안 된다(SHALL NOT). system action의 기존 transaction 참여와 post-commit effect 시점·격리도 변경해서는 안 된다(SHALL NOT).

#### Scenario: 기반만 배포

- **WHEN** execution boundary 변경만 배포된다
- **THEN** 기존 owner credential과 전역 DB를 사용하는 미이전 system SQL이 계속 동작한다
- **AND** Post system SQL 이전은 `PROD-710`의 별도 변경으로 남는다

#### Scenario: 기반 rollback

- **WHEN** execution boundary 변경을 rollback한다
- **THEN** schema나 credential rollback 없이 기존 전역 owner DB 경계로 돌아갈 수 있다
