# fedify-db-execution-boundary Specification

## Purpose

기존 owner credential과 SQL 동작을 유지하면서 Web inbound와 후속 Temporal Worker Activity의 Fedify 작업이 명시적 DB handle 및 action transaction 수명 경계를 사용하게 하는 계약을 정의한다.

## Requirements

### Requirement: Fedify 작업은 명시적 DB execution context를 받는다

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-706`. Web inbound Fedify invocation은 작업마다 명시적인 DB handle을 가진 Fedify execution context를 생성해 handler 경계에 전달해야 한다(SHALL). 같은 package-internal context와 action 경계는 후속 Temporal Worker Fedify Activity가 재사용할 수 있어야 한다(SHALL). 이 경계를 Fedify와 무관한 notification/background system abstraction으로 일반화해서는 안 된다(SHALL NOT).

#### Scenario: Web inbound context 전달

- **WHEN** Web runtime이 inbound ActivityPub 요청을 처리한다
- **THEN** 해당 invocation에만 생성된 Fedify execution context가 federation handler 경계에 전달된다
- **AND** context는 기존 owner DB handle을 사용한다

#### Scenario: 후속 Temporal Activity 재사용

- **WHEN** 후속 change가 outbound Fedify를 Temporal Worker Activity에서 실행한다
- **THEN** Activity는 API viewer context 없이 같은 package-internal Fedify execution 경계에 DB handle을 전달할 수 있다

### Requirement: API viewer 경계는 Fedify 실행 권한을 노출하지 않는다

**Authority / Provenance:** `PROD-706`. API viewer context와 API가 사용하는 public package surface는 Fedify execution context factory, credential selector 또는 role 전환 기능을 노출해서는 안 된다(SHALL NOT). API outbound 작업은 Fedify를 직접 실행하는 seam을 새로 받지 않고 후속 durable intent 경계를 사용해야 한다(SHALL).

#### Scenario: API context 분리

- **WHEN** GraphQL API가 viewer operation context를 만든다
- **THEN** API context는 Fedify execution context를 생성하거나 Fedify role을 가장할 수 없다
- **AND** 이 change는 API outbound Fedify 직접 호출 경계를 추가하지 않는다

### Requirement: Fedify action은 전달된 handle의 transaction 수명을 소유한다

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-706`. 원자적 DB 작업을 수행하는 Fedify action은 전달된 DB handle에서 transaction을 열고 성공 시 commit하며 오류 시 rollback해야 한다(SHALL). 성공 또는 오류 뒤 transaction과 connection은 호출 경계를 벗어나 유지되거나 pool에서 누출되어서는 안 된다(SHALL NOT).

#### Scenario: Fedify action 성공

- **WHEN** Fedify action callback이 정상 완료된다
- **THEN** 전달 handle에서 연 transaction이 commit된다
- **AND** callback 결과가 호출자에게 반환된다
- **AND** 사용한 connection이 pool에 반환된다

#### Scenario: Fedify action 오류

- **WHEN** Fedify action callback이 오류를 던진다
- **THEN** 전달 handle에서 연 transaction이 rollback된다
- **AND** 같은 오류가 호출자에게 전파된다
- **AND** 사용한 connection이 pool에 반환된다

### Requirement: Fedify가 사용하는 공유 core service는 전달 DB handle을 선택할 수 있다

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-706`. Fedify가 사용하는 공유 core service의 기존 database 선택 seam은 database handle과 caller-owned transaction handle을 모두 받을 수 있어야 한다(SHALL). handle이 없는 기존 호출자는 현재 전역 owner DB fallback과 SQL 결과를 유지해야 한다(SHALL).

#### Scenario: Database handle 전달

- **WHEN** Fedify caller가 명시적 database handle을 전달한다
- **THEN** 지원되는 core service seam은 전역 DB 대신 전달된 handle에서 service-owned transaction을 실행한다

#### Scenario: 기존 호출자 호환

- **WHEN** 기존 caller가 DB handle 없이 공유 core service를 호출한다
- **THEN** service는 기존 전역 owner DB를 선택한다
- **AND** credential, SQL 결과와 오류 동작은 변경 전과 동일하다

### Requirement: 기반 변경은 후속 Fedify RLS slice와 독립적으로 배포된다

**Authority / Provenance:** `PROD-706`, `PROD-710`. execution boundary 배포는 특정 도메인 SQL을 새 handle로 이전하거나 runtime credential, RLS policy·grant, owner credential과 ActivityPub 제품 행동을 변경해서는 안 된다(SHALL NOT). Fedify action의 기존 transaction 참여와 post-commit effect 시점·격리도 변경해서는 안 된다(SHALL NOT).

#### Scenario: 기반만 배포

- **WHEN** Fedify execution boundary 변경만 배포된다
- **THEN** 기존 owner credential과 전역 DB를 사용하는 미이전 Fedify SQL이 계속 동작한다
- **AND** Post Fedify SQL 이전은 `PROD-710`의 별도 변경으로 남는다

#### Scenario: 기반 rollback

- **WHEN** execution boundary 변경을 rollback한다
- **THEN** schema나 credential rollback 없이 기존 전역 owner DB 경계로 돌아갈 수 있다
