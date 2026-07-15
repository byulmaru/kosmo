## Why

현재 GraphQL Relay Node ID는 DB UUID를 그대로 노출하고 UUID v8의 table discriminator로 GraphQL type을 추론한다. 하나의 DB table이 여러 concrete GraphQL type을 제공하는 Notification 모델을 지원하려면 공개 GraphQL identity와 DB identity를 분리하고, 더 이상 type discriminator가 필요 없는 DB ID 생성 규칙으로 단순화해야 한다.

## What Changes

- **BREAKING** GraphQL Node ID를 raw DB UUID에서 concrete GraphQL typename과 DB UUID를 담은 unpadded base64url opaque global ID로 변경한다.
- **BREAKING** 배포 즉시 새 global ID만 GraphQL Node ID 입력과 게시글 URL에 허용하고 legacy raw UUID fallback이나 route-level 변환은 제공하지 않는다.
- `node(id:)`, `nodes(ids:)`와 Node ID를 받는 query·mutation이 global ID의 concrete typename을 기준으로 올바른 loader에 라우팅되도록 변경한다.
- 신규 DB row의 ID를 PostgreSQL 18.4 내장 `uuidv7()` column default로 생성하고 애플리케이션 ID generator, `TableDiscriminator` registry와 호출부 의존성을 제거한다.
- 기존 UUIDv8 primary key와 foreign key는 재작성하지 않고 신규 UUIDv7과 함께 계속 조회한다.
- Relay client가 ID를 opaque URL-safe 값으로 그대로 전달하는지 검증하고 schema, generated artifact, API·client 테스트와 ID 관련 문서를 새 계약에 맞춘다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `api-platform`: Relay Node identity를 raw UUID와 table discriminator 기반 type 판별에서 concrete typename 기반 opaque global ID로 변경한다.
- `data-model`: 신규 도메인 row의 ID 생성 규칙을 discriminator 포함 UUIDv8에서 표준 UUIDv7으로 변경하고 기존 UUIDv8 값의 무마이그레이션 공존을 규정한다.

## Impact

- API: `apps/api/src/graphql/builder.ts`, 공용 Node ref helper와 모든 Node resolver, Node ID 입력 validation 및 GraphQL schema/test.
- Core/DB: `packages/core/db/id.ts`, Drizzle table default ID 생성기, service-level ID 생성 호출부와 관련 테스트.
- Client: Relay generated artifact와 Node ID를 mutation/query 변수로 전달하는 경로. 현재 Relay store는 메모리 기반이므로 compatibility window나 저장 cache migration은 필요하지 않다.
- Data: PostgreSQL column type/constraint와 기존 primary key·foreign key 값은 바꾸지 않는다. column `DEFAULT`만 `uuidv7()`로 바꾸는 schema migration을 적용하며 기존 UUIDv8과 신규 UUIDv7이 함께 존재한다.
- Specs/docs: canonical `api-platform`, `data-model`, 관련 active change와 `memory/graphql-style.md`, `memory/database-design.md`를 동기화한다.
