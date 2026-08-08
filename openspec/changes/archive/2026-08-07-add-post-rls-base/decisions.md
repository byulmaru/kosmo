## Context

이 기록은 PROD-368의 Post/Post Content RLS 전환 계약과 PROD-370의 독립 Expand 경계, 현재 PostgreSQL/Drizzle schema와 production migration 운영 규칙을 구현 가능한 durable 선택으로 구체화한다. 후속 PROD-713/714가 공유해야 하는 setting/helper 이름은 이 base가 소유하되, 각 policy·grant와 credential 전환은 결정하지 않는다.

## Decision Records

### owner bypass를 유지한 채 두 table의 RLS만 활성화한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: `memory/database-migrations.md`, `docs/operations/production-migrations.md`, PROD-368, PROD-370
- Status: Active
- Context / Problem: 현재 모든 production Post workload가 table owner credential을 사용한다. policy나 credential transition보다 먼저 RLS base를 독립 배포하면서 기존 workload를 중단하면 안 된다.
- Decision Outcome: `post`와 `post_content`에 `ENABLE ROW LEVEL SECURITY`만 적용한다. `FORCE ROW LEVEL SECURITY`, policy와 grant는 추가하지 않아 owner는 기존 bypass를 유지하고 policy 없는 non-owner만 fail-closed 된다.
- Alternatives Considered: `FORCE`와 임시 allow-all policy를 함께 추가하는 방식은 후속 policy ownership을 선점하고 base rollback을 결합한다. RLS 활성화를 PROD-713/714에 미루는 방식은 공통 base와 policy의 독립 배포를 막는다.
- Consequences: non-owner credential transition은 후속 policy 전에는 실행할 수 없다. owner 폐기는 PROD-712가 모든 slice gate 뒤 소유한다.
- Confirmation / Follow-up: owner CRUD 무회귀, `relrowsecurity=true`, `relforcerowsecurity=false`, policy 0개와 non-owner SELECT/DML fail-closed를 배포 전 일회성 disposable PostgreSQL 검증으로 확인한다. 후속 policy가 의도적으로 바꾸는 stage-specific 상태를 영구 회귀 테스트로 고정하지 않는다.

### actor setting과 public helper 이름을 Post RLS slice 전체에서 고정한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-368, PROD-370, PROD-708
- Status: Active
- Context / Problem: PROD-708 writer와 PROD-713 API policy가 서로 다른 setting/helper 이름을 사용하면 독립 PR이 merge된 뒤 runtime에서 조용히 `NULL` context가 되어 모든 행을 차단할 수 있다. 이 호환 이름은 선행 base가 고정해야 한다.
- Decision Outcome: transaction-local setting key는 `kosmo.account_id`, `kosmo.profile_id`로 고정한다. 조회 helper는 `public.kosmo_current_account_id()`와 `public.kosmo_current_profile_id()`이며 각각 `uuid` 또는 `NULL`만 반환하는 STABLE, PARALLEL SAFE, invoker-rights SQL function으로 만든다. `SECURITY DEFINER`, table 조회와 setting write는 사용하지 않고 `pg_catalog` built-in만 호출한다.
- Alternatives Considered: generic `current_uuid(setting_name)`는 아직 필요한 두 context보다 넓은 public contract를 만든다. custom schema는 후속 non-owner에 schema USAGE grant가 필요해 이번 grant 제외 경계와 결합한다. 각 policy에서 `current_setting` cast를 반복하면 invalid 값 처리와 명명이 갈라질 수 있다.
- Consequences: PROD-708은 같은 key에 transaction-local 값을 쓰고, PROD-713은 helper를 통해 읽어야 한다. PROD-714 system policy는 actor setting 존재를 권한 증거로 사용하지 않는다. helper 이름 변경은 downstream 호환 변경으로 취급한다.
- Confirmation / Follow-up: 누락·빈 문자열·invalid UUID·valid UUID와 transaction 종료 뒤 setting 누출 부재를 검증한다.

### index는 concrete policy join key의 기존 지원을 먼저 증명한다

- Decision Date: 2026-08-07
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/database-design.md`, PROD-368, PROD-370
- Status: Active
- Context / Problem: 후속 policy는 여러 관계를 확인하지만, relation마다 index를 선제 추가하면 중복 storage/write cost가 생긴다. 현재 source lookup처럼 outer row의 FK 값으로 대상 primary key를 찾는 경로는 FK column 단독 index가 없어도 된다.
- Decision Outcome: Post author는 `post(profile_id, id)`, author Instance는 Profile/Instance primary key와 `profile(instance_id, normalized_handle)` unique, Post Content parent는 `post_content(post_id)`, Follow는 `profile_follow(follower_profile_id, followee_profile_id)` unique, Repost Source는 source Post primary key lookup을 사용 가능한지 catalog와 execution plan으로 검증한다. 증명된 gap에만 additive index를 추가한다.
- Alternatives Considered: 모든 FK에 단독 index를 추가하거나 `post(repost_source_id)`를 선제 추가하는 방식은 실제 predicate shape 없이 index를 고정한다. catalog 이름만 확인하는 방식은 optimizer가 lookup 경로로 사용할 수 있는지 증명하지 못한다.
- Consequences: 이번 migration에 새 index가 없을 수 있으며, 이는 검증 누락이 아니라 existing index reuse 결과다. PROD-713/714의 실제 policy predicate가 다른 plan을 만들면 해당 policy issue가 자기 index와 plan을 소유한다.
- Confirmation / Follow-up: representative fixture에서 각 경로의 `EXPLAIN (FORMAT JSON)`과 index catalog를 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
