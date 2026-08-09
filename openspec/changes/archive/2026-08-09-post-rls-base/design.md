## Context

`post`와 `post_content`는 현재 table owner가 사용하는 PostgreSQL 테이블이며 RLS가 비활성화되어 있다. API
viewer policy와 workload transition은 별도 이슈가 소유하므로, 이번 변경은 기존 owner 경로를 깨뜨리지 않는
Expand metadata만 준비해야 한다. Drizzle schema와 version-controlled migration snapshot은 함께 갱신해야 하며,
현재 migration runner는 파일별 transaction과 forward-only history를 사용한다.

## Goals / Non-Goals

**Goals:**

- 두 테이블에 table-level RLS를 활성화하고 Drizzle metadata/snapshot을 일치시킨다.
- `FORCE`·policy·grant 없이 owner bypass와 policy 없는 non-owner fail-closed 경계를 확인한다.
- 후속 Post policy의 구체 join 경로가 기존 index로 지원되는지 배포 전 일회성 PostgreSQL evidence로 확인한다.
- 빈 database 전체 replay와 독립 rollback 경계를 유지한다.

**Non-Goals:**

- actor setting/helper, API/system policy·grant, credential·endpoint·DB handle 전환
- 애플리케이션 권한 predicate 제거, row rewrite/backfill 또는 speculative index
- 영구적인 stage-specific migration test나 자동 down migration

## Implementation Guidance

### Current Constraints

- `packages/core/db/tables.ts`는 Post와 Post Content 선언에 table-level RLS metadata를 표현해야 한다.
- Drizzle migration history에 이미 적용된 directory나 SQL을 수정할 수 없으므로 새 timestamp migration과 snapshot을
  생성한다.
- `ENABLE ROW LEVEL SECURITY`만 적용하면 owner는 기존 bypass를 유지하지만, policy가 없는 non-owner는 SELECT 결과가
  비고 DML이 RLS로 거부된다. `FORCE`나 임시 policy를 추가하면 이번 단계의 호환성 경계를 깨뜨린다.
- 작은 fixture에서는 optimizer가 순차 스캔을 선택할 수 있으므로 index catalog와 forced `EXPLAIN` lookup 가능성을
  분리해 확인한다.

### Recommended Approach

1. Posts와 PostContents를 `pgTable.withRLS`로만 표시하고 다른 table 선언은 건드리지 않는다.
2. Drizzle Kit으로 새 migration/snapshot을 생성한 뒤 migration SQL이 두 `ALTER TABLE ... ENABLE ROW LEVEL
SECURITY`만 포함하는지 diff로 확인한다.
3. 기존 generic migration replay를 실행해 빈 database 적용 가능성을 확인한다. 별도 영구 RLS test 파일이나
   stage-specific smoke assertion은 추가하지 않는다.
4. disposable PostgreSQL에서 owner SELECT/DML, 최소 privilege non-owner의 no-policy SELECT/DML fail-closed,
   `relrowsecurity`/`relforcerowsecurity`/policy count를 한 번 확인한다.
5. 대표 fixture의 Post→Profile→Instance, PostContent→Post, Follow, Repost Source 경로를 catalog와
   `EXPLAIN (FORMAT JSON)`으로 확인하고, gap이 없으면 새 index를 만들지 않는다. 이 evidence는 구현/Linear handoff에
   기록하고 후속 실제 policy가 자기 plan을 다시 검증한다.

### Allowed Alternatives

- Drizzle Kit이 생성한 migration을 동일한 SQL 의미의 수동 forward migration으로 정리할 수 있다. 단 snapshot과
  schema metadata가 일치하고 RLS 외 변경이 없어야 한다.
- 배포 전 검증은 disposable PostgreSQL script 또는 기존 migration smoke 실행 뒤의 수동 `psql` 명령으로 수행할 수
  있다. 영구 테스트로 stage별 policy 수나 helper 구현을 고정하지 않는다.

### Known Traps

- `FORCE ROW LEVEL SECURITY`, permissive 임시 policy, grant를 넣으면 owner 호환성 또는 downstream ownership을
  침범한다.
- actor helper나 setting writer를 함께 추가하면 PROD-370/PROD-726 경계를 침범한다.
- `post.repost_source_id` 같은 FK에 선제 단독 index를 추가하면 실제 lookup 증거 없이 write cost를 늘린다.
- 기존 migration SQL을 재생성하거나 history를 재정렬하면 production runner의 hash 계약을 깨뜨린다.

## Risks / Trade-offs

- [두 ALTER TABLE이 짧은 DDL lock을 요구한다] → data rewrite 없는 단일 migration으로 적용하고 migration Job의 기존
  timeout/forward failure 경계를 사용한다.
- [policy 전 non-owner workload는 접근할 수 없다] → PROD-713 policy·grant와 credential transition이 완료되기
  전에는 owner 경로를 유지하고 이번 change에서 workload를 전환하지 않는다.
- [forced plan evidence가 production cost를 예측하지 않는다] → 이번 검증은 lookup index 가능성만 증명하며 실제
  policy predicate plan은 PROD-713에서 재검증한다.

## Migration Plan

1. Drizzle schema 변경과 새 migration/snapshot을 생성하고 SQL/snapshot diff를 확인한다.
2. 빈 disposable PostgreSQL에서 전체 migration replay를 실행한다.
3. 배포 전 일회성 PostgreSQL evidence로 owner/non-owner RLS catalog와 concrete join/index 경로를 확인한다.
4. production에서는 기존 immutable migration Job으로 base만 적용한다. 후속 policy/workload 전환 전 rollback이
   필요하면 history를 수정하거나 자동 down migration을 실행하지 않고 승인된 새 forward migration에서 두 테이블의
   RLS를 비활성화한다.

## Open Questions

없음.
