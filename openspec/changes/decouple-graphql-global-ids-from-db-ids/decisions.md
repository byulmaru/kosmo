## Context

이 결정 로그는 PROD-366, proposal, `api-platform`·`data-model` delta spec과 design을 반영한다. GraphQL concrete Node identity와 DB UUID의 책임 분리, legacy GraphQL ID rollout, 신규 DB ID 생성 규칙 및 기존 데이터 처리 방식을 구현 전에 고정한다.

## Decision Records

### GraphQL Node ID는 concrete typename 기반 opaque global ID다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: DB UUID v8의 table discriminator로 typename을 추론하면 하나의 table이 여러 concrete GraphQL object를 제공할 수 없고 공개 API identity가 DB ID layout에 결합된다.
- Decision Outcome: 모든 GraphQL Node ID는 concrete GraphQL typename과 underlying DB UUID를 포함하는 opaque global ID로 encode한다. decode된 concrete typename으로 등록된 loader를 직접 선택하며 UUID version이나 discriminator로 type을 추론하지 않는다.
- Alternatives Considered: DB UUID raw 노출 유지, Notification 전용 row 선조회 route, interface typename encode, UUID discriminator 중복 등록. 모두 공용 identity 계약을 계속 DB layout에 결합하거나 concrete loader routing을 모호하게 만들어 채택하지 않았다.
- Consequences: 같은 DB table의 row도 concrete GraphQL type마다 올바른 typename을 포함할 수 있다. typename/UUID mismatch에서는 다른 loader를 추론해 재시도하지 않으며 visibility는 concrete loader가 적용한다.
- Confirmation / Follow-up: typename별 round trip, unknown/interface typename, mismatch, batch order/null API test로 확인한다.

### Legacy raw UUID GraphQL ID를 즉시 중단한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: raw UUID fallback을 유지하면 배포와 client migration은 완만해지지만 discriminator 기반 typename 추론을 compatibility path에 남겨야 한다.
- Decision Outcome: 배포 즉시 새 global ID만 GraphQL Node ID 입력으로 허용한다. raw UUID는 compatibility window나 dual decoder 없이 invalid global ID로 처리한다.
- Alternatives Considered: 한 release 동안 dual decode, versioned API field, raw UUID에서 discriminator를 읽는 영구 fallback. 현재 지원 Relay store가 메모리 기반이고 persisted cache migration이 필요하지 않으며, compatibility 경로가 제거하려는 결합을 보존하므로 채택하지 않았다.
- Consequences: 기존 응답에서 raw UUID를 저장한 외부 소비자는 새 schema 응답의 global ID로 갱신해야 한다. 기존 DB UUID의 저장 유효성과 GraphQL input 호환성은 별개다.
- Confirmation / Follow-up: raw UUID Node query와 mutation input 거부 test, client cache 구성 점검으로 확인한다.

### 신규 DB ID는 UUIDv7이고 기존 UUIDv8은 재작성하지 않는다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: GraphQL type 선택이 global ID typename으로 이동하면 신규 DB ID에 table discriminator를 예약할 이유가 없다. 기존 UUIDv8 primary key와 foreign key를 바꾸는 migration은 비용과 위험만 만든다.
- Decision Outcome: 신규 DB row는 table discriminator 없는 표준 UUIDv7을 사용한다. 기존 UUIDv8 primary key와 foreign key는 삭제, backfill 또는 재작성하지 않고 신규 UUIDv7과 영구 공존시킨다. PostgreSQL `uuid` schema migration은 만들지 않는다.
- Alternatives Considered: discriminator 없는 UUIDv8 유지, 모든 ID를 UUIDv7으로 data migration, 기존 `TableDiscriminator` registry만 비활성 상태로 보존. 표준 형식의 이점이 없거나 불필요한 data risk와 유지 책임을 남겨 채택하지 않았다.
- Consequences: generator와 호출부에서 `TableDiscriminator`가 제거된다. 기존 UUIDv8과 신규 UUIDv7은 같은 48-bit millisecond timestamp 위치를 가지지만 같은 millisecond 안의 단조 생성 순서는 보장하지 않는다.
- Confirmation / Follow-up: UUIDv7 version·variant·timestamp unit test와 기존 UUIDv8 fixture를 통한 loader/integration test로 확인한다.

### Node를 받는 도메인 입력은 concrete global ID를 decode한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: 일반 GraphQL `ID`와 UUID validator를 유지하면 새 opaque global ID가 validation에서 거부되거나 encoded 문자열이 DB query로 전달될 수 있다.
- Decision Outcome: Node를 식별하는 query·mutation input은 허용된 concrete Node type의 global ID를 API input 경계에서 decode하고 underlying DB UUID만 service/DB 경계로 전달한다.
- Alternatives Considered: resolver마다 수동 decode, validation 제거 후 string 전달, core service가 GraphQL global ID를 이해하도록 변경. 중복 parsing, 런타임 오류 또는 GraphQL/core 책임 역전을 만들어 채택하지 않았다.
- Consequences: input typename도 도메인 대상 type과 일치해야 하며 core service는 계속 DB UUID만 다룬다.
- Confirmation / Follow-up: profile 관련 mutation input의 성공, raw UUID 거부, 잘못된 typename test로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- canonical `api-platform`의 “DB UUID를 GraphQL Node ID로 그대로 사용하고 table discriminator로 type을 판별한다”는 계약은 2026-07-15의 concrete typename 기반 opaque global ID 결정으로 대체한다.
- canonical `data-model`과 기존 ID memory의 “신규 DB ID에 `TableDiscriminator`를 포함한다”는 계약은 2026-07-15의 신규 UUIDv7·기존 UUIDv8 무마이그레이션 공존 결정으로 대체한다.
