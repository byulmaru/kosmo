# post-rls-base Specification

## Purpose

Post와 Post Content가 기존 owner workload를 유지하면서 PostgreSQL RLS policy를 독립적으로 확장할 수 있는 table-level 기반을 정의한다.

## Requirements

### Requirement: Post와 Post Content는 owner bypass를 유지하는 RLS base를 가진다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `memory/database-migrations.md`, `docs/operations/production-migrations.md`, `PROD-737`, `PROD-368`; 이 요구사항을 MUST 준수한다.

The system MUST enable PostgreSQL ROW LEVEL SECURITY on `post` and `post_content`. 두 테이블은 owner에 `FORCE ROW LEVEL SECURITY`를 적용해서는 안 되며, 기존 owner workload의 SELECT와 DML 결과를 유지해야 한다.

이 capability는 table-level RLS 기반만 정의한다. actor setting/helper, policy·grant, workload credential·endpoint·DB handle과 애플리케이션 권한 predicate의 계약을 대신 정의해서는 안 된다(MUST NOT).

#### Scenario: table-level RLS metadata

- **WHEN** Post RLS base가 적용된 database의 catalog를 조회한다
- **THEN** `post`와 `post_content`는 RLS가 활성화되어 있다
- **AND** 두 테이블의 FORCE RLS는 비활성화되어 있다

#### Scenario: 기존 owner workload

- **WHEN** table owner가 Post와 Post Content를 SELECT하고 허용된 INSERT, UPDATE, DELETE를 수행한다
- **THEN** RLS base 적용 전과 같은 결과와 DML 성공 경계를 유지한다
