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

### Legacy raw UUID GraphQL ID와 게시글 URL을 즉시 중단한다

- Decision Date: 2026-07-15
- Status: Accepted
- Context / Problem: raw UUID fallback을 유지하면 배포와 client migration은 완만해지지만 discriminator 기반 typename 추론을 compatibility path에 남겨야 한다. 게시글 route에서 raw UUID를 `Post` global ID로 감싸는 별도 호환도 가능하지만 공개 URL 계약을 이중화한다.
- Decision Outcome: 배포 즉시 새 global ID만 GraphQL Node ID 입력과 게시글 URL에 허용한다. raw UUID는 compatibility window, dual decoder 또는 route-level 변환 없이 invalid global ID로 처리한다.
- Alternatives Considered: 한 release 동안 dual decode, versioned API field, raw UUID에서 discriminator를 읽는 영구 fallback, 게시글 route에서 raw UUID를 `Post` global ID로 변환. 현재 지원 Relay store가 메모리 기반이고 persisted cache migration이 필요하지 않으며, compatibility 경로가 제거하려는 결합과 이중 URL 계약을 보존하므로 채택하지 않았다.
- Consequences: 기존 응답에서 raw UUID를 저장한 외부 소비자와 과거 raw UUID 게시글 URL을 공유·북마크한 사용자는 새 schema 응답의 global ID URL로 갱신해야 한다. 기존 DB UUID의 저장 유효성과 GraphQL input·URL 호환성은 별개다.
- Confirmation / Follow-up: raw UUID Node query와 mutation input 거부 test, 새 global ID를 그대로 사용하는 post detail E2E와 client cache 구성 점검으로 확인한다.

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

### UUIDv7은 PostgreSQL 18.4 column default로 생성한다

- Decision Date: 2026-07-16
- Status: Accepted
- Context / Problem: production database는 PostgreSQL 18.4이며 표준 `uuidv7()` 함수를 내장한다. 애플리케이션에서 동일한 UUID bit layout을 직접 구현하면 중복 코드와 별도 검증 책임이 생긴다. 기존 테스트 DB의 PostgreSQL 17 설정은 production과 불일치했다.
- Decision Outcome: 모든 주요 도메인 table의 신규 ID는 PostgreSQL `uuidv7()` column default로 생성한다. 애플리케이션 `createId`를 제거하고 테스트 DB를 PostgreSQL 18.4로 맞춘다. 기존 ID 값은 재작성하지 않고 column default만 변경하는 schema migration을 적용한다.
- Alternatives Considered: 애플리케이션 custom generator 유지, UUID library dependency 추가, PostgreSQL 17 호환 함수를 직접 설치. production이 이미 PostgreSQL 18.4이고 DB default가 모든 insert 경로를 일관되게 다루므로 채택하지 않았다.
- Consequences: insert가 ID를 생략할 수 있고 DB round trip 전에는 ID를 알 수 없다. 미리 생성한 ID 비교에 의존하던 conflict 판별은 `RETURNING` row 유무로 변경한다. PostgreSQL 18 미만 환경은 지원하지 않는다.
- Confirmation / Follow-up: migration SQL의 default-only 변경, `uuid_extract_version(id) = 7`, 기존 UUIDv8 fixture 보존, production과 동일한 test DB image로 검증한다.

### GraphQL global ID는 UUID-first binary payload의 unpadded base64url을 사용한다

- Decision Date: 2026-07-16
- Status: Accepted
- Context / Problem: Pothos 기본 base64 global ID는 `+`, `/`, `=`를 포함할 수 있어 post route의 path segment마다 `encodeURIComponent`가 필요하다. 공개 opaque ID가 transport 위치마다 추가 변환을 요구하면 client 전달 계약이 복잡해진다.
- Decision Outcome: encode 전 payload는 DB UUID의 raw 16바이트를 앞에 두고 concrete GraphQL typename의 ASCII bytes를 뒤에 구분자 없이 배치한 뒤 padding 없는 base64url로 encode한다. decoder는 고정된 첫 16바이트를 UUID로, 나머지를 typename으로 읽고 URL-safe alphabet을 검증한다. typename 지원 여부는 Pothos Node registry가 판단한다. padded base64, raw UUID, 기존 `typename:uuid-string` payload와 malformed 값을 거부한다. 클라이언트는 받은 ID를 추가 escaping 없이 route와 GraphQL variable에 그대로 사용한다.
- Alternatives Considered: Pothos 기본 base64를 유지하고 모든 route에서 URL encode/decode, UUID를 URL 전용 별도 key로 변환, 가변 길이 typename을 앞에 두고 separator 또는 length prefix를 추가, GraphQL Name 문자 집합을 6-bit 단위로 packing. 첫 방식은 누락 위험과 이중 표현을 만들고, 두 번째는 공개 identity를 둘로 나누며, typename-first framing은 UUID가 이미 고정 16바이트인 상황에서 불필요한 구분 정보를 추가하므로 채택하지 않았다. 6-bit packing은 일반적인 typename에서 global ID를 1~3자 줄이는 데 비해 custom bit codec과 canonical padding 검증 복잡도가 커 채택하지 않았다.
- Consequences: `Post` global ID는 20-byte payload가 되어 27자다. 최초 global ID cutover 전이므로 별도 호환 decoder를 제공하지 않는다. ID는 계속 opaque하며 client가 base64url payload를 decode하거나 typename/UUID에 의존해서는 안 된다. 이 형식은 underlying Node ID가 UUID라는 현재 계약에 의존한다.
- Confirmation / Follow-up: codec unit test에서 URL-safe alphabet과 invalid/padded 입력 거부를 검증하고 post detail E2E에서 ID가 추가 escaping 없이 path와 GraphQL variable에 전달되는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- canonical `api-platform`의 “DB UUID를 GraphQL Node ID로 그대로 사용하고 table discriminator로 type을 판별한다”는 계약은 2026-07-15의 concrete typename 기반 opaque global ID 결정으로 대체한다.
- canonical `data-model`과 기존 ID memory의 “신규 DB ID에 `TableDiscriminator`를 포함한다”는 계약은 2026-07-15의 신규 UUIDv7·기존 UUIDv8 무마이그레이션 공존 결정으로 대체한다.
- 2026-07-15 UUIDv7 결정의 애플리케이션 custom generator와 schema migration 없음 부분은 2026-07-16의 PostgreSQL 18.4 `uuidv7()` column default 결정으로 대체한다. 기존 ID 무재작성 결정은 유지한다.
