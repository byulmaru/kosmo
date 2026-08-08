## Context

현재 `post`와 `post_content`는 `kosmo` owner가 소유하며 RLS가 비활성화되어 있다. API와 federation/system workload도 아직 owner credential을 사용하므로 이번 Expand에서 RLS를 활성화해도 `FORCE ROW LEVEL SECURITY`를 사용하지 않으면 기존 runtime은 owner bypass로 같은 결과를 유지한다. PROD-713과 PROD-714는 이 base 위에 서로 독립적인 policy와 grant를 추가하고, PROD-708은 API operation transaction에서 actor setting을 쓰는 경계를 별도로 소유한다.

현재 schema에는 `post(profile_id, id DESC)`, `post_content(post_id)`, `profile(instance_id, normalized_handle)` unique, `profile_follow(follower_profile_id, followee_profile_id)` unique와 각 table primary key가 있다. 따라서 알려진 policy join은 새 범용 index 없이도 지원할 가능성이 높고, 실제 PostgreSQL plan으로 확인해야 한다.

## Goals / Non-Goals

**Goals:**

- owner workload 무회귀와 policy 없는 non-owner fail-closed를 동시에 만족하는 additive RLS base를 만든다.
- Account/Profile transaction setting을 오류 없이 nullable UUID로 읽는 좁은 helper를 제공한다.
- 후속 policy join마다 기존 index가 충분한지 검증하고 부족한 경우에만 index를 추가한다.
- 빈 database replay, 기존 owner data, role-level RLS와 execution plan을 실제 PostgreSQL 18 test target에서 검증한다.

**Non-Goals:**

- API viewer 또는 system policy와 grant
- production role/credential provision 또는 workload credential 전환
- GraphQL/system SQL handle 이전과 actor setting writer 구현
- 애플리케이션 권한 predicate 제거
- PROD-368 전체 slice 통합 검증 또는 OpenSpec archive

## Implementation Guidance

### Current Constraints

- Drizzle TypeScript table schema는 table-level RLS metadata를 표현할 수 있으므로 Post/Post Content 선언과 migration snapshot을 함께 맞춰야 한다. database function은 migration SQL이 source다.
- migration runner는 version-control의 directory를 파일별 transaction으로 적용하며 이미 적용된 SQL을 수정할 수 없다.
- helper에서 `current_setting(..., true)::uuid`를 바로 cast하면 빈 문자열과 잘못된 값이 transaction 전체를 오류 상태로 만들 수 있다.
- 작은 test fixture에서는 optimizer가 정상적인 index가 있어도 sequential scan을 선택할 수 있으므로 index 존재와 실제 lookup 가능성을 분리해 검증해야 한다.
- `post.repost_source_id` 단독 index는 Source Post를 outer row의 FK 값으로 primary-key lookup하는 경로에 필요하지 않다. 현재 partial unique index를 범용 source lookup index로 오인하면 중복 write cost를 추가한다.

### Recommended Approach

- 하나의 수동 Drizzle migration에서 `post`와 `post_content`에 `ENABLE ROW LEVEL SECURITY`만 적용한다. `FORCE`, policy와 grant는 넣지 않는다.
- `public` schema에 Account/Profile 전용 STABLE SQL function을 각각 두고 `kosmo.account_id`, `kosmo.profile_id` setting을 `missing_ok=true`로 읽는다. PostgreSQL의 input validation을 먼저 통과한 값만 UUID cast하고 나머지는 `NULL`로 만든다. 호출하는 built-in은 `pg_catalog`로 한정해 `search_path` 영향을 피한다.
- 배포 전 일회성 disposable PostgreSQL 검증에서 migration과 fixture를 적용한 뒤 owner CRUD, 임시 non-owner role의 SELECT/DML 차단, helper 입력 행렬, `relrowsecurity=true`와 `relforcerowsecurity=false`, policy 부재를 확인한다.
- plan 검증은 각 join의 index catalog를 먼저 확인하고, test transaction에서 sequential scan을 비활성화한 `EXPLAIN (FORMAT JSON)`으로 구체 index가 lookup 후보가 되는지 확인한다. 실제 index가 부족하다는 증거가 있을 때만 schema와 migration에 추가한다.
- 기존 일반 migration smoke로 빈 database 전체 replay가 성공하는지 확인한다. 후속 policy가 의도적으로 바꾸는 policy 수, helper 구현 속성, 특정 index 목록은 장기 smoke assertion으로 고정하지 않는다.

### Allowed Alternatives

- UUID 입력 검증은 누락·빈 값·잘못된 PostgreSQL UUID를 모두 `NULL`로 만들고 PostgreSQL이 허용하는 모든 UUID 표기를 보존하도록 native UUID input validation과 guarded cast로 구현할 수 있다.
- execution plan 검증은 배포 전 일회성 검증으로 보존하고, 실제 policy predicate의 장기 plan 책임은 PROD-713/714가 소유한다.

### Known Traps

- `FORCE ROW LEVEL SECURITY`를 추가하면 아직 owner credential을 쓰는 workload가 policy 없이 즉시 fail-closed 되므로 이번 Expand 경계를 깨뜨린다.
- base migration에 permissive 임시 policy를 넣으면 non-owner fail-closed 완료 기준을 깨뜨리고 후속 policy ownership을 선점한다.
- helper가 session-level setting을 쓰거나 setting writer까지 소유하면 PROD-708과 credential transition 경계를 침범한다.
- non-owner role에 owner membership 또는 BYPASSRLS를 주면 role-level 테스트가 RLS를 검증하지 못한다.
- production rollback을 자동 down migration으로 구현하면 현재 forward-only migration 운영 계약과 충돌한다.

## Risks / Trade-offs

- [후속 policy 전까지 non-owner runtime은 Post SQL을 사용할 수 없음] → credential transition은 PROD-713/714 policy와 해당 transition gate 뒤에만 수행한다.
- [공개 schema의 helper는 호출 가능성이 넓음] → helper는 setting을 읽어 UUID/NULL만 반환하고 data 조회, setting 변경, `SECURITY DEFINER`를 사용하지 않는다.
- [RLS 활성화가 짧은 table lock을 요구함] → data rewrite가 없는 두 `ALTER TABLE`만 독립 file transaction에서 실행하고 migration timing을 검증한다.
- [forced plan test가 production cost를 직접 예측하지 못함] → 이 테스트는 index 사용 가능성만 증명하며 실제 policy가 추가되는 PROD-713/714에서 실제 predicate plan을 다시 검증한다.

## Migration Plan

1. base migration을 빈 disposable PostgreSQL에서 전체 replay한다.
2. 기존 owner fixture에 migration을 적용해 SELECT와 DML 결과가 유지되는지 확인한다.
3. 임시 non-owner role과 최소 test privilege로 policy 부재 fail-closed 및 helper 입력 행렬을 확인한다.
4. catalog와 execution plan으로 join/index 경로를 확인한다.
5. production에는 기존 migration Job 경계로 base만 배포하고 owner workload 회귀를 관찰한다.
6. 후속 policy/credential 전환 전에 rollback이 필요하면 새 승인된 forward migration으로 두 table의 RLS를 비활성화하고 이 base가 추가한 helper/index만 제거한다. history를 수정하거나 자동 down migration을 실행하지 않는다.

## Open Questions

없음.
