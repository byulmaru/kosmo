## Context

이 기록은 `post-rls-base` proposal/spec/design과 현재 PROD-737 계약을 반영한다. PROD-368의 Post/Post Content
RLS 단계 중 table-level Expand만 다루며, actor helper(PROD-370)와 API policy/grant(PROD-713) 및 workload 전환은
별도 생명주기로 유지한다.

## Decision Records

### owner 호환성을 위해 두 table에 ENABLE RLS만 적용한다

- Decision Date: 2026-08-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `memory/database-migrations.md`, `docs/operations/production-migrations.md`, `PROD-737`, `PROD-368`
- Status: Active
- Context / Problem: 후속 policy와 non-owner workload보다 먼저 RLS metadata를 배포해야 하지만 현재 owner workload를
  중단하거나 downstream policy ownership을 선점할 수 없다.
- Decision Outcome: `post`와 `post_content`에 PostgreSQL `ENABLE ROW LEVEL SECURITY`만 적용하고 `FORCE ROW LEVEL
SECURITY`, policy와 grant는 추가하지 않는다. owner는 기존 bypass를 유지하고 policy 없는 non-owner는
  fail-closed가 된다.
- Alternatives Considered: `FORCE`는 아직 policy가 없는 owner 경로를 차단한다. 임시 allow-all policy 또는 grant는
  후속 PROD-713의 권한 계약과 독립 배포 경계를 선점한다.
- Consequences: non-owner credential 전환은 후속 policy/grant와 별도 transition 뒤에만 가능하며, 이번 migration은
  row data나 workload SQL을 변경하지 않는다.
- Confirmation / Follow-up: disposable PostgreSQL에서 owner SELECT/DML, non-owner no-policy SELECT/DML과
  `relrowsecurity`, `relforcerowsecurity`, policy count를 일회성으로 확인한다.

### Drizzle table metadata와 forward migration을 함께 동기화한다

- Decision Date: 2026-08-09
- Decision Class: Implementation Choice
- Authority / Provenance: `memory/database-migrations.md`, `PROD-737`
- Status: Active
- Context / Problem: schema 선언만 바꾸거나 snapshot만 수동 수정하면 다음 Drizzle diff가 RLS 상태를 잃거나
  이미 적용된 migration hash 계약을 깨뜨릴 수 있다.
- Decision Outcome: 두 table 선언에 `.withRLS`를 사용하고 새 version-controlled migration/snapshot을 생성한다.
  migration은 RLS metadata 외 column, relation, constraint, index, helper와 policy를 포함하지 않는다.
- Alternatives Considered: 기존 migration을 재생성·수정하는 방식은 production history hash 검증과 충돌한다. 수동
  snapshot만 편집하는 방식은 schema source와 generated artifact가 갈라진다.
- Consequences: 변경은 additive Expand file 하나로 적용되며 rollback은 새 승인 forward migration으로만 수행한다.
- Confirmation / Follow-up: generated SQL/diff와 빈 database 전체 replay 결과에서 두 table RLS metadata만 추가됐는지
  확인한다.

### join/index와 RLS catalog는 일회성 배포 전 evidence로 확인한다

- Decision Date: 2026-08-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/policies/post-list.md`, `memory/database-design.md`, `PROD-737`, `PROD-368`
- Status: Active
- Context / Problem: 후속 policy join이 기존 index로 충분한지 증명 없이 FK별 단독 index를 추가하면 write/storage
  비용만 늘어난다. 반대로 RLS base의 정확한 catalog 상태는 generic replay 성공만으로 드러나지 않는다.
- Decision Outcome: 대표 fixture에서 index catalog와 `EXPLAIN (FORMAT JSON)`을 한 번 확인하고, RLS owner/non-owner
  role matrix와 force/policy 상태도 배포 전에 수동 검증한다. 기존 generic migration replay는 유지하되
  stage-specific permanent migration test나 policy/helper 구현 세부를 고정하는 회귀 테스트는 추가하지 않는다.
- Alternatives Considered: 모든 FK에 speculative index를 추가하는 방식은 concrete predicate 증거가 없다. 영구
  stage test는 후속 policy가 바꿀 policy 수와 implementation detail을 장기 계약으로 고정한다.
- Consequences: 이번 change에는 새 index나 전용 migration test가 없을 수 있으며, 후속 PROD-713이 실제
  predicate plan과 runtime parity를 다시 소유한다.
- Confirmation / Follow-up: 일회성 결과를 구현 handoff/Linear evidence로 남기고, generic migration smoke와
  Drizzle artifact 검증을 함께 실행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
