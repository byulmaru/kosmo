## 1. PROD-370 Post/Post Content RLS base

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `memory/database-migrations.md`
- `docs/operations/production-migrations.md`
- PROD-368
- PROD-370

**Deliverable**

기존 owner workload 결과를 유지하면서 Post와 Post Content에 RLS가 활성화되고, policy가 없는 non-owner는 fail-closed 된다.

**Guardrails**

- `FORCE ROW LEVEL SECURITY`, API/system policy·grant, credential과 application SQL/predicate 변경을 포함하지 않는다.
- 기존 row를 rewrite하거나 backfill하지 않는다.
- production migration history를 수정하거나 자동 down migration을 추가하지 않는다.

**Verification**

- PostgreSQL catalog에서 두 table의 RLS 활성화, FORCE 비활성화와 policy 부재를 확인한다.
- 기존 owner fixture의 SELECT·INSERT·UPDATE·DELETE 결과와 non-owner의 SELECT·DML fail-closed를 확인한다.

- [x] 1.1 owner bypass와 non-owner fail-closed 경계를 만족하는 additive RLS migration을 구현한다.
- [x] 1.2 RLS catalog, owner workload 무회귀와 policy 없는 non-owner role matrix를 검증한다.

## 2. PROD-370 안전한 actor context helper

**Authority / Provenance**

- `docs/domain/objects/profile.md`
- PROD-368
- PROD-370
- PROD-708

**Deliverable**

후속 policy가 Account/Profile transaction setting을 누락·빈 값·잘못된 값에서도 오류 없이 UUID 또는 `NULL`로 읽을 수 있다.

**Guardrails**

- setting key는 `kosmo.account_id`, `kosmo.profile_id`이고 helper는 `public.kosmo_current_account_id()`, `public.kosmo_current_profile_id()`다.
- helper는 invoker rights의 조회 전용 함수이며 setting, table data 또는 session 상태를 변경하지 않는다.
- API/system policy, grant와 setting writer는 구현하지 않는다.

**Verification**

- Account/Profile 각각 누락, 빈 문자열, invalid UUID, valid UUID 결과를 확인한다.
- transaction-local setting이 transaction 종료 뒤 다음 사용에 actor 값으로 남지 않는지 확인한다.

- [x] 2.1 고정된 setting/helper 계약과 안전한 UUID 해석을 migration에 구현한다.
- [x] 2.2 helper 입력 행렬과 transaction-local 누출 부재를 PostgreSQL에서 검증한다.

## 3. PROD-370 join/index 및 migration 검증

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/post-content.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/instance.md`
- `docs/domain/policies/post-list.md`
- `memory/database-design.md`
- `memory/database-migrations.md`
- PROD-368
- PROD-370

**Deliverable**

후속 policy의 Post/Profile/Instance/Follow/Post Content/Repost Source join 경로가 concrete index로 지원되고 base migration이 독립적으로 replay·검증된다.

**Guardrails**

- existing primary/unique/general index가 지원하는 경로에는 중복 index를 추가하지 않는다.
- 실제 gap이 증명된 경로에만 additive index를 추가한다.
- 후속 policy predicate 자체와 그 policy에만 필요한 최종 plan tuning은 PROD-713/714에 남긴다.

**Verification**

- index catalog와 representative `EXPLAIN (FORMAT JSON)`으로 각 join key의 lookup 경로를 확인한다.
- OpenSpec strict validation, migration test, migration smoke, 관련 core database regression과 formatting/static check를 통과시킨다.
- PR에 독립 배포·forward rollback 경계와 PROD-713/714 downstream blocker를 기록한다.

- [x] 3.1 각 policy join 경로의 existing index 사용 가능성을 검증하고 증명된 gap에만 migration/schema index를 추가한다.
- [x] 3.2 빈 database migration replay와 representative final schema smoke에 RLS/helper 결과를 포함한다.
- [x] 3.3 관련 PostgreSQL·core 회귀와 정적 검증을 통과시키고 scope 침범 여부를 self-review한다.
- [x] 3.4 PROD-370에 검증 근거를 갱신하고 독립 배포·rollback 경계와 downstream blocker가 명시된 Ready PR을 게시한다.
