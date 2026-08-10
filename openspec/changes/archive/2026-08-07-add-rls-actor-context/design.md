## Context

Post 정책이 공통 actor context를 사용하려면 setting key, UUID 해석 규칙과 helper 이름이 독립적인 구현 slice 사이에서 고정되어야 한다. PROD-370은 PostgreSQL에서 값을 안전하게 읽는 경계만 제공하고, 값을 설정하는 호출자와 실제 policy 적용은 downstream이 소유한다.

## Goals / Non-Goals

**Goals:**

- Account와 Profile actor context에 사용할 두 setting key와 public helper 이름을 고정한다.
- 누락·빈 문자열·잘못된 UUID를 오류 없이 `NULL`로 해석하고 유효한 PostgreSQL UUID는 보존한다.
- helper가 setting과 table data를 변경하지 않는 read-only, invoker-rights 함수임을 보장한다.
- PROD-713과 PROD-726이 같은 contract를 독립적으로 소비할 수 있게 한다.

**Non-Goals:**

- Post/Post Content table, RLS enablement, owner/non-owner 결과와 join/index
- API/system policy와 grant
- setting writer, credential 전환, DB handle 또는 PgBouncer connection lifecycle
- application predicate 제거와 Post SQL 이전
- PROD-737이 소유하는 Post RLS base

## Implementation Guidance

### Fixed contract

| Context | PostgreSQL setting key | Read-only helper                    | Return type                 |
| ------- | ---------------------- | ----------------------------------- | --------------------------- |
| Account | `kosmo.account_id`     | `public.kosmo_current_account_id()` | `pg_catalog.uuid` or `NULL` |
| Profile | `kosmo.profile_id`     | `public.kosmo_current_profile_id()` | `pg_catalog.uuid` or `NULL` |

각 helper는 자신의 key만 읽어야 하며 다른 actor context를 대신 사용해서는 안 된다. helper 호출 시점에 PostgreSQL이 노출하는 setting을 `pg_catalog.current_setting(key, true)`로 읽고, `pg_catalog.pg_input_is_valid(value, 'pg_catalog.uuid')`가 참인 경우에만 `pg_catalog.uuid`로 cast한다. 값이 `NULL`, 빈 문자열 또는 잘못된 UUID이면 guarded cast를 수행하지 않고 `NULL`을 반환한다.

함수는 `LANGUAGE sql`, `STABLE`, `PARALLEL SAFE`, `SECURITY INVOKER`로 선언할 수 있다. 구현은 `pg_catalog` built-in만 호출하고 table 조회, setting write, `SECURITY DEFINER` 또는 검색 경로에 의존하는 사용자 정의 lookup을 사용하지 않는다.

이 change는 setting의 writer, 적용 범위와 connection lifecycle을 정의하지 않는다. PROD-726은 setting을 공급하고 DB connection을 관리하는 후속 경계를 소유하며, PROD-713은 helper를 실제 viewer policy에서 소비한다.

### Migration boundary

helper function 생성은 additive migration object로 취급한다. 기존 migration history를 수정하거나 자동 down migration을 추가하지 않는다. 되돌림이 승인되면 helper function만 제거하는 별도의 forward migration을 사용하며, downstream policy·grant·credential 변경과 결합하지 않는다.

## Allowed Alternatives

- PostgreSQL이 허용하는 모든 UUID 표기를 유지하면서 동일한 `pg_input_is_valid`와 guarded cast 결과를 보장하는 동등한 SQL 표현을 사용할 수 있다.
- 두 helper를 하나의 migration file에 함께 선언하거나 별도 migration으로 나누어도 key/function/return contract와 additive rollback 경계를 바꾸지 않으면 된다.

## Known Traps

- `current_setting(..., true)::uuid`를 바로 cast하면 빈 문자열 또는 malformed value가 호출 오류를 일으킬 수 있다.
- Account key로 Profile helper를 구현하거나 함수 이름을 downstream과 다르게 정하면 policy가 조용히 `NULL` context를 사용하게 된다.
- helper에 setting write, table query 또는 `SECURITY DEFINER`를 추가하면 read-only contract와 invoker 권한 경계를 침범한다.
- helper contract에 writer, connection lifecycle, policy·grant를 포함하면 PROD-726, PROD-713과 독립 배포 경계를 잃는다.

## Risks / Trade-offs

- [공개 schema helper는 넓은 호출자에게 노출될 수 있음] → helper는 UUID 또는 `NULL`만 반환하고 data 조회·변경을 수행하지 않는다.
- [잘못된 actor setting은 policy에서 모든 행을 거부하는 입력이 될 수 있음] → invalid/missing 값의 `NULL` 결과와 fail-closed 정책 적용은 PROD-713이 명시적으로 소비한다.
- [setting 공급과 helper 배포 시점이 다를 수 있음] → key/function 이름을 PROD-370에서 고정하고 공급 및 lifecycle은 PROD-726에 남긴다.

## Verification Plan

1. disposable PostgreSQL에서 두 helper function의 signature, volatility, parallel safety와 invoker-rights metadata를 확인한다.
2. 각 key에 대해 missing, empty, malformed UUID와 valid UUID 입력을 호출해 각각 `NULL`, `NULL`, `NULL`, 동일 UUID 결과를 확인한다.
3. helper 호출 전후 setting 값과 table data가 변하지 않는지 확인한다.
4. 빈 database migration replay와 OpenSpec strict validation을 실행하고 downstream policy·connection lifecycle을 이 change의 검증 증거로 사용하지 않는다.

## Open Questions

없음.
