## Context

이 로그는 `PROD-439`의 Local Media 업로드 시작 계약, 새 `local-media-upload-start` capability, 기존 `image-upload` 제거 delta와 현재 API/DB 구조를 반영한다.

## Decision Records

### 하나의 Media identity가 업로드 state를 소유한다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`, `PROD-441`
- Status: Active
- Context / Problem: 별도 upload claim과 File을 둘 경우 외부 저장 서비스가 파일 표현을 소유하는 경계에서 identity와 상태가 중복된다.
- Decision Outcome: 업로드 시작 시 Kosmo Media를 `Uploading`으로 만들고 후속 완료 시 같은 Media를 `Ready`로 전환한다. 별도 claim이나 File 객체는 만들지 않는다.
- Alternatives Considered: 별도 upload claim 뒤 Ready Media 생성, File을 상태 객체로 사용, 기존 File/Media 동시 생성. 모두 identity 또는 외부 저장 책임을 중복하므로 선택하지 않았다.
- Consequences: `PROD-439`는 Uploading 생성만, `PROD-441`은 같은 row의 Ready 전환만 소유한다.
- Confirmation / Follow-up: mutation integration test에서 Uploading Media만 생성하는지 확인하고 schema/migration diff에서 File persistence 제거를 확인한다. 생성 migration history의 실행 검증은 하지 않는다.

### 외부 저장 참조를 비공개 persistence로 유지한다

- Decision Date: 2026-07-26
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-435`, `PROD-439`
- Status: Active
- Context / Problem: storage key를 API identity로 노출하면 Media 권한과 외부 저장 구현이 결합된다.
- Decision Outcome: Media Storage Service의 opaque 저장 참조는 Local Media에 영속화하되 GraphQL payload나 Media 공개 field에 노출하지 않는다.
- Alternatives Considered: 저장 참조를 Media ID로 사용하거나 응답에 함께 노출. 권한과 저장 구현을 결합하므로 선택하지 않았다.
- Consequences: consumer는 Kosmo Media ID와 일회성 upload URL만 사용하며 후속 완료 확인도 Media 권한을 별도로 검증해야 한다.
- Confirmation / Follow-up: GraphQL schema와 성공 payload에 raw 저장 참조가 없는지 확인한다.

### 외부 권한 발급 뒤 Media를 영속화한다

- Decision Date: 2026-07-26
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-439`
- Status: Active
- Context / Problem: Uploading Media는 유효한 외부 업로드 권한과 결속되어야 하지만 외부 HTTP 호출과 PostgreSQL insert는 원자적으로 묶을 수 없다.
- Decision Outcome: 인증과 행동 주체를 검증한 뒤 외부 업로드 권한을 발급받고, 응답 검증 후 Media를 insert하며, insert 성공 뒤에만 upload URL을 반환한다.
- Alternatives Considered: Media를 먼저 insert한 뒤 외부 호출, DB transaction 안에서 외부 호출, consumer에게 URL을 먼저 반환. 실패한 미결속 Media, 긴 transaction 또는 관찰 가능한 불완전 성공을 만들므로 선택하지 않았다.
- Consequences: DB insert 실패 시 consumer에게 노출되지 않은 외부 upload slot이 만료 전까지 남을 수 있다.
- Confirmation / Follow-up: 외부 실패와 HTTP 요청은 production resolver wiring을 사용하는 GraphQL integration test로, DB insert 실패 시 URL을 반환하지 않는 동작은 격리된 test DB의 storage reference 충돌로 확인한다. 생성 migration history 실행과 orphan 정리는 현재 범위 밖이다.

### 기존 Media/File schema를 데이터 precondition 없이 교체한다

- Decision Date: 2026-07-26
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`
- Status: Active
- Context / Problem: 기존 `/upload`, `Media`, `File` 경로에 production consumer가 없으며 사용자는 DB 내용 검증을 이 변경의 gate로 두지 않기로 했다.
- Decision Outcome: migration은 기존 Media row를 별도 검사 없이 삭제하고 File table을 제거한 뒤 새 Local Media state schema로 교체한다.
- Alternatives Considered: expand/transition/contract migration, DB emptiness assertion, legacy column 유지. 사용되지 않는 계약의 호환 비용만 늘리므로 선택하지 않았다.
- Consequences: 기존 Media row는 삭제되고 File 데이터도 table과 함께 제거된다. migration 자체의 정적 형식과 schema 일관성은 검증한다.
- Confirmation / Follow-up: DB 실행 검증은 하지 않고 생성된 migration과 schema diff를 review한다.

### Ready 전환은 외부 확인 뒤 conditional update로 수행한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-435`, `PROD-440`, `PROD-441`
- Status: Active
- Context / Problem: 외부 저장 완료 확인과 PostgreSQL state 전환은 하나의 transaction으로 묶을 수 없고, 반복·동시 완료 요청은 첫 성공 결과를 바꾸면 안 된다.
- Decision Outcome: 요청 Account가 소유한 Local Media를 먼저 조회한다. Ready이면 그대로 반환하고, Uploading이면 외부 `HEAD` 확인의 `204` 뒤 `id + accountId + LOCAL + UPLOADING` 조건 update 하나로 `READY`와 `readyAt`을 기록한다. concurrent loser는 같은 Account의 Ready row를 다시 읽어 반환한다.
- Alternatives Considered: 외부 호출을 transaction 안에 넣기, row lock으로 직렬화하기, 매 요청마다 Ready와 `readyAt` 덮어쓰기. 긴 transaction/lock 또는 멱등 결과 변경을 만들므로 선택하지 않았다.
- Consequences: 외부 저장 완료 뒤 update가 실패하면 Media는 Uploading으로 남고 caller가 같은 mutation을 재시도해야 한다. 이미 Ready인 반복 요청은 외부 서비스를 다시 호출하지 않는다.
- Confirmation / Follow-up: GraphQL/DB integration test에서 첫 전환, 반복 요청, concurrent conditional update 결과, 외부 실패와 persistence 실패를 확인한다.

### 완료 권한은 Upload Account 소유권으로 판정한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-441`
- Status: Active
- Context / Problem: Local Media의 Profile은 업로드 행동 주체를 보존하지만 완료 권한은 `Media.UploadAccount`이며, 같은 Account가 다른 Member Profile context에서 요청할 수 있다.
- Decision Outcome: 완료 mutation은 `usingProfile` 인증 context를 사용하고 Media의 `accountId`가 요청 Account와 같은지 검증한다. Media Profile과 현재 선택 Profile의 일치를 요구하거나 Account/Profile actor query를 반복하지 않는다.
- Alternatives Considered: Media Profile만 완료 허용, 선택 Profile의 InstanceKind.LOCAL 재검증, resolver에서 membership 재조회. canonical 권한보다 범위를 좁히거나 인증 context 검증을 중복하므로 선택하지 않았다.
- Consequences: 같은 Account의 다른 유효한 선택 Profile에서도 Media identity/Profile 관계를 바꾸지 않고 완료할 수 있다.
- Confirmation / Follow-up: 다른 Account 거부와 같은 Account의 다른 Profile 성공을 integration test로 확인한다.

### opaque 저장 참조는 해석 없이 완료 endpoint에 전달한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-440`, `PROD-441`
- Status: Active
- Context / Problem: 저장 참조 형식은 Media Storage Service 내부 계약이며 Kosmo Media identity나 공개 API가 아니다.
- Decision Outcome: persistence에서 읽은 저장 참조를 형식 검증하거나 분해하지 않고 URL path segment로만 안전하게 인코딩해 완료 endpoint에 전달한다. GraphQL schema와 payload에는 노출하지 않는다.
- Alternatives Considered: `u_<UUIDv4>`를 Kosmo에서 재검증하거나 Media global ID로 사용. provider 내부 형식과 Kosmo 권한을 결합하므로 선택하지 않았다.
- Consequences: malformed persistence가 있다면 Media Storage Service 응답을 외부 확인 실패로 처리하며 Kosmo가 별도 형식 정책을 소유하지 않는다.
- Confirmation / Follow-up: opaque 값의 encoded endpoint 호출과 GraphQL 비노출을 테스트한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 별도 Account upload claim을 만들고 완료 시 Media/File을 생성하는 초안은 canonical ADR 0018과 수정된 `PROD-435`/`PROD-439`가 정한 단일 Media state로 대체되었다.
