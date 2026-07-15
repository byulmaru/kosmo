## 1. PROD-366 DB ID 생성 계약 전환

**Deliverable**

신규 도메인 row는 표준 UUIDv7 ID를 사용하고 기존 UUIDv8 row는 data/schema migration 없이 계속 유효하다.

**Guardrails**

- 기존 primary key와 foreign key 값을 삭제, backfill 또는 재작성하지 않는다.
- PostgreSQL `uuid` column, primary key와 foreign key schema를 변경하지 않는다.
- 같은 millisecond 안의 단조 생성 순서를 보장하지 않는다.

**Verification**

- 신규 ID의 UUID version, variant와 timestamp layout을 unit test로 검증한다.
- repository에 신규 ID 생성을 위한 table discriminator 의존성과 DB migration이 남지 않았는지 확인한다.

- [x] 1.1 표준 UUIDv7 생성 동작과 version·variant·timestamp 검증을 구현한다.
- [x] 1.2 모든 신규 DB ID 생성 경로에서 table discriminator 의존성을 제거하고 migration이 없음을 확인한다.

## 2. PROD-366 GraphQL global Node ID 전환

**Deliverable**

GraphQL Node는 concrete typename 기반 opaque global ID를 반환·입력받고 올바른 concrete loader로 직접 라우팅된다.

**Guardrails**

- raw UUID GraphQL ID fallback을 제공하지 않는다.
- UUID version이나 discriminator로 GraphQL type을 추론하지 않는다.
- typename/UUID mismatch에서 다른 loader를 재시도하지 않는다.
- concrete loader의 visibility와 auth 조건을 유지한다.

**Verification**

- schema 실행 test로 typename별 round trip, raw UUID·invalid/unknown typename 거부, mismatch null, batch 순서/null을 검증한다.
- Node ID를 받는 mutation이 올바른 concrete global ID만 받아 underlying DB UUID를 기존 service/DB 경계에 전달하는지 검증한다.

- [x] 2.1 Node ID encode/decode와 loadable Node ref를 concrete typename 기반 global ID 계약으로 전환한다.
- [x] 2.2 Node를 식별하는 query·mutation input을 허용된 concrete global ID decode 계약으로 전환한다.
- [x] 2.3 global ID와 mixed Node batch 회귀 검증을 추가한다.

## 3. PROD-366 Client와 schema artifact 정렬

**Deliverable**

지원 Relay client가 새 Node ID를 opaque 값으로 전달하며 schema와 generated artifact가 서버 계약과 일치한다.

**Guardrails**

- 클라이언트는 typename, UUID 또는 global ID encoding을 파싱하지 않는다.
- 현재 메모리 기반 Relay store를 위해 persisted cache migration을 추가하지 않는다.

**Verification**

- Node ID가 route와 mutation variable에서 opaque string으로 전달되는지 점검한다.
- GraphQL schema generation, Relay artifact generation과 client typecheck를 통과시킨다.

- [x] 3.1 client ID 사용 경로를 점검하고 필요한 schema·Relay artifact를 갱신한다.
- [x] 3.2 API와 client 정적 검증을 실행해 공개 GraphQL shape와 소비 코드가 정렬됐는지 확인한다.

## 4. PROD-366 계약 문서와 전체 검증

**Deliverable**

canonical/active OpenSpec과 프로젝트 memory가 구현된 ID 계약을 설명하고 관련 회귀 검증이 통과한다.

**Guardrails**

- archived OpenSpec의 과거 기록은 재작성하지 않는다.
- Notification 기능 자체와 다른 이슈가 소유한 도메인 동작을 구현하지 않는다.

**Verification**

- canonical spec, 모든 active change와 ID 관련 memory에서 제거된 discriminator 기반 신규 ID/Node 계약이 남아 있지 않은지 검색한다.
- OpenSpec validation과 영향받는 package test를 실행한다.

- [x] 4.1 canonical/active OpenSpec과 GraphQL·DB memory를 concrete global ID와 UUIDv7 계약으로 동기화한다.
- [x] 4.2 OpenSpec validation, 영향받는 unit/integration test와 workspace lint를 실행하고 결과를 기록한다.
