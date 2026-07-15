## Context

현재 공용 Pothos Relay 설정은 global ID encode를 우회해 DB UUID를 그대로 반환하고, decode 시 UUID v8의 12-bit `TableDiscriminator`를 `globalIdMap`에서 typename으로 변환한다. `createObjectRef`도 discriminator와 typename을 함께 등록하므로 하나의 DB table discriminator가 하나의 concrete GraphQL object에 대응해야 한다. Notification처럼 하나의 table을 interface와 여러 concrete object로 노출하면 이 전제가 성립하지 않는다.

DB ID 생성기도 같은 discriminator를 UUID v8의 implementation-defined 영역에 기록한다. PostgreSQL column은 이미 native `uuid`이고 기존 UUIDv8과 표준 UUIDv7의 48-bit millisecond timestamp 위치가 같으므로 data rewrite 없이 생성기만 전환할 수 있다. 지원 Relay client의 `RecordSource`는 메모리 기반이며 persisted normalized cache가 없다.

## Goals / Non-Goals

**Goals:**

- GraphQL Node identity를 DB identity와 분리하고 concrete typename으로 loader를 직접 선택한다.
- raw UUID 입력 fallback 없이 새 global ID로 즉시 전환한다.
- 신규 DB ID를 표준 UUIDv7으로 만들고 table discriminator 의존성을 제거한다.
- 기존 UUIDv8 row와 신규 UUIDv7 row가 migration 없이 공존하도록 한다.
- Node ID를 받는 mutation이 global ID를 type-safe하게 decode한 underlying UUID만 service/DB 경계에 전달하도록 한다.

**Non-Goals:**

- 기존 DB primary key 또는 foreign key 재작성.
- UUID version 통일 migration.
- Notification schema, concrete Notification type 또는 UI 구현.
- persisted Relay cache migration이나 legacy GraphQL ID compatibility window.

## Implementation Guidance

### Current Constraints

- Pothos Relay plugin은 기본적으로 `base64(typename:id)` 형태의 opaque global ID encode/decode와 `globalID` input parser를 제공하지만 현재 builder override가 이를 우회한다.
- 일반 `ID` input에 붙은 `z.uuid()` validation은 새 opaque global ID를 거부하고, validation을 단순 제거하면 resolver가 encoded ID를 DB UUID로 잘못 사용할 수 있다.
- Node ref helper의 discriminator argument와 모든 ref 호출부, Drizzle default ID 함수와 service-level `createId` 호출부가 함께 변경되어야 한다.
- 기존 UUIDv8 값은 DB와 내부 service 경계에서 계속 정상 UUID로 취급되어야 하지만 GraphQL 입력에서는 반드시 새 global ID로 감싸져야 한다.
- UUIDv7을 ID 단독 정렬에 사용할 때도 같은 millisecond 안의 생성 순서는 보장하지 않는다.

### Recommended Approach

Pothos Relay plugin의 기본 global ID encoder/decoder를 사용하도록 custom override와 `globalIdMap`을 제거한다. `createObjectRef`는 GraphQL type name과 loader만 받고 loadable Node ref를 만들며, Node field의 underlying ID resolver는 계속 DB UUID를 반환한다. Pothos가 응답 시 concrete typename과 UUID를 global ID로 encode하고 `node`/`nodes` 입력에서 decode된 typename별 loader를 batch 호출하게 한다.

Node ID를 받는 mutation input은 일반 `ID`와 `z.uuid()` 조합 대신 Pothos `globalID({ for: ConcreteNodeRef })`를 사용한다. resolver는 decode된 `{ typename, id }` 중 `id`만 core service나 Drizzle query에 전달한다. 이 방식은 malformed ID와 raw UUID를 공통 decoder에서 거부하고 허용된 concrete type도 input 경계에서 제한한다.

DB generator는 기존 48-bit millisecond timestamp 기록을 유지하되 version nibble을 `7`, variant를 RFC 4122/9562 `10`, 나머지 영역을 cryptographic random으로 채운다. 인자를 받지 않는 공용 `createId()`로 단순화하고 모든 table default/service 호출부에서 discriminator를 제거한다. PostgreSQL schema는 바꾸지 않는다.

API unit test는 실제 schema execution으로 global ID output/decode, raw UUID 거부, unknown typename, typename/row mismatch, mixed batch order/null을 검증한다. Core unit test는 UUID version/variant/timestamp와 random 영역을 검증한다. 기존 DB integration test는 UUID version을 8로 고정해 assert하지 않는지 확인한다.

### Allowed Alternatives

Pothos 기본 형식과 같은 계약을 보존하는 별도 encoder/decoder helper는 허용할 수 있지만, custom registry나 DB UUID discriminator 기반 typename 추론을 다시 도입해서는 안 된다. UUIDv7 생성은 표준을 정확히 구현하는 이미 승인된 dependency를 사용할 수 있으나 이 변경에는 작은 공용 generator 구현이 충분하다.

### Known Traps

- Node ID 응답만 encode하고 mutation input을 일반 `ID`로 남기면 encoded 값이 DB query까지 전달된다.
- legacy raw UUID를 typename 추론으로 수용하면 즉시 cutover 결정과 DB/API identity 분리가 무효화된다.
- global ID의 typename과 UUID가 가리키는 실제 row type이 다를 때 UUID discriminator로 다른 loader를 재시도하면 spoofed type이 성공할 수 있다.
- active OpenSpec과 memory에 남은 `TableDiscriminator` 계약을 갱신하지 않으면 후속 구현이 제거된 패턴을 다시 추가할 수 있다.

## Risks / Trade-offs

- [기존 외부 소비자가 raw UUID를 저장했을 수 있음] → 의도적인 breaking cutover로 기록하고 새 schema 응답에서 받은 ID만 사용하도록 한다.
- [Global ID 문자열이 URL segment에 사용되며 base64 문자가 포함될 수 있음] → 클라이언트 router가 ID를 opaque segment로 전달하는 현재 경로를 검증하고 필요 시 URL encoding을 적용한다.
- [UUIDv7 custom generator 구현 오류] → version, variant, timestamp byte layout을 deterministic test로 고정한다.
- [기존 UUIDv8과 신규 UUIDv7의 혼재가 정렬 가정을 드러낼 수 있음] → ID 단독 ordering은 millisecond group만 제공한다고 문서화하고 정확한 저장 시각 정렬에는 timestamp와 ID tie-breaker를 사용한다.

## Migration Plan

1. OpenSpec과 ID 관련 memory를 새 계약으로 동기화한다.
2. UUIDv7 generator와 호출부를 전환한다. DB migration은 만들거나 실행하지 않는다.
3. GraphQL global ID encode/decode, Node refs와 mutation input을 한 배포 단위에서 전환한다.
4. schema/Relay artifact를 재생성하고 API·client 회귀 테스트를 수행한다.
5. 배포 즉시 raw UUID GraphQL ID 입력을 거부한다. rollback 시 애플리케이션 코드를 이전 버전으로 되돌릴 수 있으며 전환 중 생성된 UUIDv7 DB row는 PostgreSQL `uuid`로 그대로 유효하다.

## Open Questions

없음.
