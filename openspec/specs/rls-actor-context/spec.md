# rls-actor-context Specification

## Purpose

Account와 선택된 Profile actor context를 PostgreSQL setting에서 안전하게 읽는 공통 helper contract를 정의한다. 이 capability는 setting key와 read-only UUID 해석만 정의하며, setting 공급·connection lifecycle과 실제 policy 적용은 범위에 포함하지 않는다.

## Requirements

### Requirement: Account와 Profile actor setting helper를 제공한다

시스템은 다음 PostgreSQL setting/function pair를 MUST 고정해 제공해야 한다.

**Authority / Provenance:** `docs/domain/objects/profile.md`, `memory/database-migrations.md`, PROD-370.

| Context | Setting key        | Helper                              | Return type                   |
| ------- | ------------------ | ----------------------------------- | ----------------------------- |
| Account | `kosmo.account_id` | `public.kosmo_current_account_id()` | `pg_catalog.uuid` 또는 `NULL` |
| Profile | `kosmo.profile_id` | `public.kosmo_current_profile_id()` | `pg_catalog.uuid` 또는 `NULL` |

각 helper는 대응하는 setting만 읽어야 하며 다른 actor context를 대신 사용해서는 안 된다(MUST NOT). helper는 setting을 생성·변경하거나 table data를 조회해서는 안 된다(MUST NOT).

#### Scenario: setting이 정의되지 않음

- **WHEN** 대응하는 PostgreSQL setting이 없는 상태에서 Account 또는 Profile helper를 호출한다
- **THEN** helper는 오류 없이 `NULL`을 반환한다

#### Scenario: setting이 비어 있음

- **WHEN** 대응하는 setting 값이 빈 문자열인 상태에서 helper를 호출한다
- **THEN** helper는 오류 없이 `NULL`을 반환한다

#### Scenario: setting이 UUID가 아님

- **WHEN** 대응하는 setting 값이 PostgreSQL UUID로 해석되지 않는 문자열인 상태에서 helper를 호출한다
- **THEN** helper는 오류 없이 `NULL`을 반환한다

#### Scenario: setting이 유효한 UUID임

- **WHEN** 대응하는 setting 값이 PostgreSQL이 허용하는 유효한 UUID 표현인 상태에서 helper를 호출한다
- **THEN** helper는 동일한 UUID type 값을 반환한다

#### Scenario: helper는 읽기 전용임

- **WHEN** caller가 helper를 호출한다
- **THEN** helper는 caller가 제공한 setting 값과 database row를 변경하지 않는다
- **AND** helper는 caller 권한보다 넓은 table/data access를 수행하지 않는다

### Requirement: malformed actor setting은 guarded UUID 해석으로 처리한다

각 helper는 PostgreSQL built-in setting 조회와 UUID input validation을 먼저 수행한 뒤 유효한 값만 `pg_catalog.uuid`로 변환해야 한다(MUST). 잘못된 값에 대한 직접 UUID cast로 호출을 오류 상태로 만들어서는 안 된다(MUST NOT). helper는 `LANGUAGE sql`, `STABLE`, `PARALLEL SAFE`, `SECURITY INVOKER` 속성을 가져야 한다(MUST).

**Authority / Provenance:** PROD-370. 이 요구사항은 MUST 준수한다.

#### Scenario: malformed 값도 호출을 중단하지 않음

- **WHEN** helper에 빈 값 또는 malformed UUID setting이 제공된다
- **THEN** helper 호출은 예외를 발생시키지 않고 `NULL`을 반환한다
- **AND** 같은 database execution context에서 후속 SQL을 실행할 수 있다
