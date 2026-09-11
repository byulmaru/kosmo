# GraphQL 코딩 스타일: Identity And Schema

## Enum

GraphQL enum은 `apps/api/src/graphql/enums.ts`에서 전역 등록한다.

- core enum 객체는 `builder.enumType`으로 구현된 뒤에만 GraphQL `type`으로 사용할 수 있다.
- 새 core enum을 resolver field에 노출하려면 먼저 `enums.ts`에 추가한다.
- enum 이름은 공개 GraphQL 타입 이름이다. `ProfileFollowPolicy`처럼 도메인 의미가 드러나는 이름을 선호한다.

## ID와 Node

- Relay Node ID는 DB UUID의 raw 16바이트 뒤에 concrete GraphQL typename ASCII bytes를 이어 붙인 payload를 unpadded base64url로 encode한 opaque global ID다. UUID가 고정 폭이므로 별도 구분자나 typename 길이 필드를 두지 않는다. URL path segment에 추가 `encodeURIComponent`를 적용하지 않는다.
- Node decode는 global ID의 concrete typename으로 해당 loadable Node ref를 찾고 underlying DB UUID를 loader에 전달한다. UUID version이나 table discriminator로 GraphQL type을 추론하지 않는다.
- Node를 식별하는 query·mutation input은 `t.input.globalID({ for: ConcreteNodeRef })`로 허용된 concrete type을 제한하고 resolver에서는 decode된 `id`만 core service나 DB query에 전달한다.
- legacy raw UUID GraphQL ID fallback은 제공하지 않는다. 기존 UUIDv8 DB row도 새 global ID로 감싸서만 GraphQL에 입력한다.
- interface typename을 concrete Node loader 대신 encode하지 않는다. Notification처럼 하나의 table이 여러 concrete object에 대응할 때는 row의 kind에 맞는 concrete object ref가 자기 typename으로 ID를 encode하고, 해당 typename의 loader가 예상 row discriminator와 visibility를 검증한다. typename과 row가 일치하지 않으면 object 없음으로 처리해 Node가 `null`을 반환한다.
- 하나의 table discriminator를 먼저 해석하는 공통 Node route를 두지 않고, concrete loader가 row를 찾지 못하거나 discriminator가 일치하지 않아도 다른 type을 추론해 재시도하지 않는다.
- 삭제·해제 payload가 Node ID를 반환하면 `field.globalID`로 실제 concrete typename과 삭제된 row의 DB UUID를 encode한다.
- 클라이언트는 ID 내부 구조에 의존하면 안 된다.

## DB 접근

- resolver 코드는 Drizzle query builder를 직접 사용한다.
- 단건 조회에는 `first`, `firstOrThrow`, `firstOrThrowWith` 같은 helper를 사용한다.
- 결과 row가 반드시 있어야 하고 없으면 DB/서버 불일치로 보는 5xx 성격의 오류라면 `firstOrThrow`를 사용한다. 예를 들어 insert/update 후 `returning()`이 비는 경우가 이에 해당한다.
- 결과 row가 없을 수 있고 그 원인이 클라이언트 입력, 권한, 대상 부재 같은 4xx 성격의 도메인 오류라면 `firstOrThrowWith`로 `NotFoundError` 등 명시적 도메인 에러를 던진다.
- 존재 확인과 actor 권한 조회는 가능하면 join으로 한 번에 처리한다. 예를 들어 profile mutation은 `Profiles`와 `AccountProfiles`를 join해 active profile 존재 여부와 actor role을 같이 조회한 뒤 role을 검사한다.
- PostgreSQL unique violation 판정은 resolver 로컬 함수로 만들지 않고 `@kosmo/core/db`의 `isUniqueViolation` helper를 사용한다.
- `createObjectRef`가 만든 loadable Node ref는 batched loading을 제공한다.
- query, mutation, relationship resolver는 불필요한 추가 조회를 피한다. 이미 row가 있으면 row를 반환하고, ID만 있으면 ID를 반환해 Node loader를 타게 한다.
- PostgreSQL `uuidv7()`로 생성한 DB ID는 millisecond timestamp 뒤에 random 영역을 사용하며 같은 millisecond 안에서는
  생성 순서가 단조 증가하지 않는다. 같은 millisecond의 임의 순서와 page 배치를 허용할 때만 ID 단독
  cursor/order를 사용한다. 저장된 시각 기준 정렬이 필요하면 immutable `createdAt`과 ID tie-breaker를
  cursor·order·index에 함께 사용한다. 동일 timestamp에서도 삽입 순서를 보장해야 하면 database ordering key나
  DB ordering key 변경을 별도 platform change로 검토한다.

## Nullability

- Pothos builder의 기본 nullability는 non-null이다.
- non-null 필드에는 `nullable: false`를 반복해서 쓰지 않는다.
- nullable 필드에만 `nullable: true`를 명시한다.
- viewer context나 인증 상태에 따라 없을 수 있는 필드는 nullable로 둔다.
- 조회 query에서 리소스를 찾지 못한 경우는 보통 null을 반환한다.

## Client And Spec Sync

- Pothos resolver/object/input/payload 변경으로 런타임 GraphQL schema가 바뀌면 같은 변경에서
  `apps/api/schema.graphql`도 갱신한다. `apps/app/relay.config.json`은 이 파일을 Relay schema source로
  사용하므로 런타임 등록만으로 client contract가 동기화됐다고 보지 않는다.
- 공개 schema shape는 `apps/api/schema.graphql`과 `apps/api`의 `lint:schema`가 하나의 계약으로 검증한다.
  기능별 unit test에서 `schema.getType()`, `getFields()`, `String(field.type)` 등으로 resolver 선언을 다시
  옮겨 적지 않는다. 이러한 검사는 resolver 동작을 증명하지 않고 SDL 동기화 검사와 중복된다.
- GraphQL 요청을 실행하는 인증, 입력 검증, ID routing 같은 행동 테스트는 `schema.test.ts` 같은 전역
  수집 파일에 모으지 않고 해당 query, mutation 또는 field 구현 옆에 둔다. 전체 schema 조립만의 별도
  불변식이 생기면 기능 계약과 구분되는 최소 검증으로 한정한다.
- GraphQL operation은 실제 사용하는 React Native `.tsx` 파일에 Relay `graphql` tag로 colocate한다. 프론트 fragment, connection, actor environment 세부 규칙은 `memory/frontend-react-native.md`를 따른다.
- GraphQL mutation error UI 분기가 여러 컴포넌트에서 반복되면 공통 helper나 error handling boundary로 모을 후보로 본다.
- API 구현과 OpenSpec은 root field, object field, payload, error type, connection 단위가 서로 맞아야 한다.
- GraphQL field/payload shape가 바뀌면 같은 변경에서 OpenSpec도 정렬한다.
