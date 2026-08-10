## 1. PROD-370 actor context contract

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- `memory/database-migrations.md`
- PROD-370

**Deliverable**

Account와 Profile PostgreSQL setting key 및 nullable UUID 조회 helper 이름이 downstream 구현에서 재사용할 수 있도록 고정된다.

**Guardrails**

- key/function pair는 `kosmo.account_id`/`public.kosmo_current_account_id()`와 `kosmo.profile_id`/`public.kosmo_current_profile_id()`다.
- helper는 read-only, `SECURITY INVOKER` SQL function이며 setting write, table lookup과 user-defined search-path dependency를 포함하지 않는다.
- Post/Post Content table, RLS enablement, join/index, owner/non-owner 결과, policy·grant, writer, credential과 PgBouncer lifecycle은 구현하지 않는다.

**Verification**

- 두 helper의 signature와 function metadata가 `pg_catalog.uuid`, `STABLE`, `PARALLEL SAFE`, invoker-rights로 확인된다.
- 각 key의 missing, empty, malformed UUID는 오류 없이 `NULL`이고 valid PostgreSQL UUID는 동일한 UUID를 반환한다.

- [x] 1.1 공통 setting key와 helper 이름을 PROD-370 contract로 고정한다.
- [x] 1.2 guarded UUID parsing과 read-only helper를 additive migration object로 구현한다.

## 2. Downstream 경계와 독립 검증

**Authority / Provenance**

- PROD-370
- Downstream PROD-713
- Downstream PROD-726

**Deliverable**

PROD-713과 PROD-726이 같은 helper contract를 사용할 수 있고, setting 공급·policy·connection lifecycle은 각 downstream 경계에 남는다.

**Guardrails**

- PROD-370은 setting을 생성·변경하지 않으며 writer와 DB connection lifecycle을 정의하지 않는다.
- viewer policy와 grant는 PROD-713, setting writer와 DB connection lifecycle은 PROD-726이 소유한다.
- Post RLS base와 table behavior는 PROD-737에 남기고 이 change에 복사하지 않는다.

**Verification**

- helper 호출 전후 setting 값과 table data가 변경되지 않는지 disposable PostgreSQL에서 확인한다.
- 빈 database migration replay, helper input matrix와 OpenSpec strict validation을 통과한다.
- self-review에서 Post table/RLS/index/owner/non-owner/policy/grant/writer/PgBouncer 변경이 없는지 확인한다.

- [x] 2.1 downstream ownership과 제외 범위를 proposal/design/decisions에 기록한다.
- [x] 2.2 helper migration 및 OpenSpec 검증 근거를 PROD-370 handoff에 정리한다.
