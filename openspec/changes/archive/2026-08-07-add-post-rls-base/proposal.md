## Why

Post와 Post Content의 행 접근 권한을 PostgreSQL RLS로 단계적으로 이전하려면, 현재 owner workload를 바꾸지 않으면서 후속 API/system policy가 같은 안전한 context 해석과 join 경계를 사용할 수 있는 독립 Expand 기반이 필요하다. 이 change는 PROD-368 전체 전환 중 PROD-370이 소유한 additive base만 전달한다.

## What Changes

- Post와 Post Content 테이블에 RLS를 활성화하되 `FORCE ROW LEVEL SECURITY`는 적용하지 않아 기존 owner workload 동작을 유지한다.
- 누락, 빈 문자열, 잘못된 UUID transaction setting을 오류 없이 `NULL`로 해석하는 조회 전용 context helper 계약을 추가한다.
- 후속 policy가 사용하는 Post → Author Profile → Instance, Post Content → Post, follower → author Follow Relationship, Repost Source 경로의 기존 join/index 적합성을 검증하고 실제로 부족한 index만 additive하게 추가한다.
- owner 무회귀, policy가 없는 non-owner fail-closed, helper 입력 행렬, schema/index와 migration replay를 PostgreSQL에서 검증한다.
- API/system policy와 grant, workload credential 전환, SQL DB handle 이전, 애플리케이션 predicate 제거는 이 change에서 구현하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/instance.md`, `docs/domain/policies/post-list.md`, `memory/database-design.md`, `memory/database-migrations.md`, `docs/operations/production-migrations.md`
- Linear Contract: PROD-368
- Linear Implementations: PROD-370

## Capabilities

### New Capabilities

- `post-rls-base`: 기존 owner workload를 보존하는 Post/Post Content RLS 활성화, 안전한 transaction setting 조회 helper, 후속 policy join/index 기반과 migration 검증을 정의한다.

### Modified Capabilities

없음.

## Impact

- PostgreSQL `post`, `post_content` schema와 RLS metadata
- 후속 PROD-713 API viewer policy 및 PROD-714 system policy가 참조할 database helper 명명과 null/fail-closed 계약
- Drizzle migration 파일, schema snapshot, PostgreSQL migration 테스트와 migration smoke
- API, GraphQL, federation/system runtime 코드와 credential에는 현재 행동 변화가 없다.
