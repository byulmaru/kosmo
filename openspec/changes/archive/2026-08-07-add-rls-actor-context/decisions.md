## Context

이 기록은 PROD-370이 소유한 공통 RLS actor context helper contract를 구현 가능한 선택으로 구체화한다. PROD-713은 helper를 viewer policy에서 소비하고 PROD-726은 setting writer와 DB connection lifecycle을 후속으로 소유한다. Post/Post Content RLS base는 PROD-737의 별도 change다.

## Decision Records

### Account/Profile setting key와 helper 이름을 고정한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-370; downstream PROD-713, PROD-726
- Status: Active
- Context / Problem: 독립적인 policy와 setting 공급 구현이 서로 다른 key 또는 helper 이름을 사용하면 actor context가 `NULL`로 해석되어 실제 policy가 의도와 다르게 동작할 수 있다.
- Decision Outcome: Account context는 `kosmo.account_id`와 `public.kosmo_current_account_id()`를 사용하고, Profile context는 `kosmo.profile_id`와 `public.kosmo_current_profile_id()`를 사용한다. 두 helper의 반환 type은 `pg_catalog.uuid`이며 값이 없으면 `NULL`이다.
- Alternatives Considered: generic `current_uuid(setting_name)`는 현재 필요한 두 context보다 넓은 public contract를 만든다. policy마다 `current_setting` cast를 반복하면 malformed input 처리와 명명이 갈라진다.
- Consequences: PROD-713은 이 helper 이름을 viewer policy에서 사용하고 PROD-726은 같은 key를 공급해야 한다. 이름 변경은 downstream 호환 contract 변경으로 취급한다.
- Confirmation / Follow-up: migration catalog와 helper input matrix에서 두 key/function pair를 확인한다.

### helper는 guarded UUID read-only SQL function이다

- Decision Date: 2026-08-09
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-370; `memory/database-migrations.md`
- Status: Active
- Context / Problem: PostgreSQL UUID cast는 empty 또는 malformed setting에서 호출 오류를 낼 수 있고, helper가 caller 권한보다 넓게 동작하면 actor context가 data access 경계가 될 수 있다.
- Decision Outcome: 각 helper는 `pg_catalog.current_setting(key, true)`를 읽고 `pg_catalog.pg_input_is_valid(value, 'pg_catalog.uuid')`가 참인 경우에만 guarded cast한다. 함수는 `LANGUAGE sql`, `STABLE`, `PARALLEL SAFE`, `SECURITY INVOKER`로 선언하며 table lookup, setting write, `SECURITY DEFINER`와 user-defined search-path lookup을 사용하지 않는다.
- Alternatives Considered: `current_setting(..., true)::uuid` 직접 cast는 invalid input에서 오류를 만들고, `SECURITY DEFINER` 또는 table-backed helper는 불필요한 권한·dependency를 추가한다.
- Consequences: missing, empty와 malformed input은 오류 없이 `NULL`이 되며 valid PostgreSQL UUID는 type equality를 보존한다. setting 공급과 policy 적용은 이 function의 책임이 아니다.
- Confirmation / Follow-up: missing, empty, malformed, valid 입력 및 helper 전후 setting 불변을 disposable PostgreSQL 검증으로 확인한다.

### setting writer와 policy lifecycle은 downstream에 남긴다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: PROD-370; downstream PROD-713, PROD-726
- Status: Active
- Context / Problem: helper contract가 setting을 쓰거나 DB connection lifecycle을 정의하면 policy와 runtime rollout이 하나의 change에 결합된다.
- Decision Outcome: PROD-370은 key를 읽는 helper만 제공한다. setting writer와 DB connection lifecycle은 PROD-726이, viewer policy와 해당 grant는 PROD-713이 각각 소유한다. 이 change에는 Post table/RLS enablement, join/index, owner/non-owner 결과, policy·grant, credential 전환과 PgBouncer가 없다.
- Alternatives Considered: helper migration에 writer 또는 permissive policy를 함께 추가하면 downstream rollout 순서와 권한 소유권을 선점한다.
- Consequences: helper는 단독으로 배포할 수 있지만 실제 actor filtering은 downstream policy와 setting 공급이 준비될 때까지 활성화되지 않는다.
- Confirmation / Follow-up: diff self-review에서 table/RLS/index/policy/writer/lifecycle 변경이 없는지 확인하고 downstream issue가 해당 runtime 검증을 소유한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
