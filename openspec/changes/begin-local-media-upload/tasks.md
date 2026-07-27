## 1. PROD-439 Local Media state persistence

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `PROD-435`
- `PROD-439`

**Deliverable**

Kosmo가 Local Media의 Upload Account, 행동 주체 Profile, Uploading state, 외부 저장 참조와 만료 시각을 File 없이 영속화할 수 있다.

**Guardrails**

- 외부 저장 참조는 Media identity가 아니며 공개 API에 노출하지 않는다.
- 이번 slice는 Local Uploading Media만 생성하고 Ready 전환을 수행하지 않는다.
- 기존 DB 데이터 존재 여부를 검사하는 migration precondition은 추가하지 않는다.

**Verification**

- schema와 migration diff가 단일 Media state 및 File 제거를 반영하는지 확인한다.
- 관련 schema/type check를 통과시킨다. DB 실행 검증은 수행하지 않는다.

- [x] 1.1 Local Uploading Media persistence와 state enum을 반영한다.
- [x] 1.2 기존 File persistence와 Media의 File/미구현 Remote projection을 제거하는 migration을 만든다.
- [x] 1.3 persistence schema와 migration 정적 검증을 실행한다.

## 2. PROD-439 업로드 시작 API

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- `PROD-435`
- `PROD-439`

**Deliverable**

인증된 Active Account가 선택된 Active/Normal Profile로 외부 업로드 권한과 결속된 Uploading Media를 생성하고 Media identity, upload URL과 만료 시각을 받을 수 있다.

**Guardrails**

- Account와 Profile을 각각 Media에 결속한다.
- 외부 저장 참조는 payload나 Media 공개 field에 노출하지 않는다.
- 외부 발급 또는 Media 영속화가 실패하면 성공 payload와 upload URL을 반환하지 않는다.
- byte 전송, 저장 완료 확인과 Ready 전환은 포함하지 않는다.

**Verification**

- GraphQL schema와 인증된 선택 Profile 요구를 단위 테스트로 검증한다.
- production 환경 설정과 전역 fetch를 사용하는 resolver의 HTTP 요청·외부 오류를 실제 GraphQL 경로로 검증한다.
- 격리된 test DB에서 Account/Profile context 조건, 선택된 Local/Remote Profile의 insert 결속, Account 간 조회 격리, 외부 실패 시 미생성과 persistence 실패 시 URL 비노출을 실제 GraphQL 경로로 검증한다.
- GraphQL schema가 Media identity, state, upload URL과 만료 시각만 공개하는지 확인한다.

- [x] 2.1 Media Storage Service 업로드 시작 응답에서 필요한 필드만 추출하고 client 취소와 deadline을 적용해 호출할 수 있게 한다.
- [x] 2.2 인증·Profile 권한과 외부 업로드 권한에 결속된 Uploading Media 생성 동작을 구현한다.
- [x] 2.3 `issueMediaUploadUrl` GraphQL mutation과 최소 Media 조회 계약을 제공한다.
- [x] 2.4 GraphQL 인증/schema를 확인하고 production resolver의 실제 GraphQL/DB 경로에서 HTTP 요청·권한·결속·격리·실패 순서를 검증한다.

## 3. PROD-439 사용되지 않는 내부 업로드 경계 제거

**Authority / Provenance**

- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- `PROD-435`
- `PROD-439`

**Deliverable**

Kosmo가 더 이상 이미지 byte, R2 storage와 File 표현을 직접 소유하지 않는다.

**Guardrails**

- 기존 `/upload`와 File 계약을 호환 API로 유지하지 않는다.
- Media Storage Service가 byte, 형식·크기 검증, storage key와 접근 URL을 소유한다.

**Verification**

- `/upload` route와 Kosmo 직접 R2 helper/config의 production reference가 남지 않았는지 검색한다.
- 기존 REST upload 테스트를 제거하거나 새 경계 검증으로 대체하고 관련 lint/type check를 통과시킨다.

- [x] 3.1 기존 `POST /upload` route와 전용 테스트를 제거한다.
- [x] 3.2 사용되지 않는 Kosmo R2 helper, 환경 변수와 dependency를 제거한다.
- [x] 3.3 저장소 reference 검색으로 제거 범위를 확인한다.

## 4. PROD-439 변경 검증

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `PROD-435`
- `PROD-439`

**Deliverable**

PROD-439 범위가 canonical 계약과 OpenSpec을 만족하고 후속 완료/Ready slice를 구현하지 않은 상태로 검증된다.

**Guardrails**

- `PROD-440`의 저장 완료 endpoint와 `PROD-441`의 Ready 전환을 변경하지 않는다.
- API persistence는 격리된 test DB로 검증하되 생성 migration history 실행과 기존 DB 데이터 검증은 요구하지 않는다.

**Verification**

- 관련 단위·GraphQL schema·DB integration 테스트, lint/type check와 OpenSpec strict validation을 통과시킨다.
- diff에서 브라우저 byte 전송, 완료 확인, Ready 전환과 Post/Profile 연결이 없는지 확인한다.

- [x] 4.1 관련 테스트와 정적 검사를 실행하고 실패를 수정한다.
- [x] 4.2 OpenSpec strict validation과 최종 scope diff review를 통과시킨다.

## 5. PROD-441 Local Media Ready 전환

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`
- `docs/domain/decisions/0013-media-storage-service-boundary.md`
- `PROD-435`
- `PROD-440`
- `PROD-441`

**Deliverable**

인증된 요청 Account가 소유한 Local/Uploading Media의 저장 완료를 확인하고 identity, Profile과 Upload Account 관계를 유지한 같은 Media를 Ready로 전환한다.

**Guardrails**

- `usingProfile`이 보장하는 Account/Profile context를 resolver actor query로 반복 검증하지 않는다.
- Media Profile과 현재 선택 Profile의 일치 또는 InstanceKind.LOCAL을 요구하지 않는다.
- 저장 참조는 persistence-only opaque 값으로 사용하고 형식을 해석·재검증하거나 GraphQL에 노출하지 않는다.
- 외부 확인 성공 전에 state를 바꾸지 않으며 state와 `readyAt`은 단일 conditional update로 함께 기록한다.
- Ready 반복 요청은 같은 identity와 최초 `readyAt`을 유지한다.

**Verification**

- GraphQL schema가 Media global ID 입력과 Ready Media 결과를 제공하고 저장 참조를 노출하지 않는지 확인한다.
- production resolver의 실제 HTTP/DB 경로에서 Account 소유권, 같은 Account의 다른 Profile, 외부 완료·미완료·실패와 멱등 전환을 확인한다.
- persistence 실패와 conditional update 경쟁에서 부분 state 전이 또는 `readyAt` 덮어쓰기가 없는지 격리된 test DB로 확인한다.

- [x] 5.1 nullable `readyAt` persistence와 additive migration을 추가한다.
- [x] 5.2 `completeMediaUpload` GraphQL mutation과 Media `readyAt` field를 구현한다.
- [x] 5.3 저장 완료 `HEAD` 확인과 conditional Ready 전환을 production resolver 경로에 연결한다.
- [x] 5.4 Account/Profile 관계 보존, 다른 Account 거부, 반복·동시 요청과 실패 원자성을 검증한다.

## 6. PROD-441 변경 검증

**Authority / Provenance**

- `docs/domain/objects/media.md`
- `PROD-435`
- `PROD-441`

**Deliverable**

PROD-441 구현이 canonical·Linear·OpenSpec 계약을 만족하고 부모 PROD-435의 cross-service 통합·archive 범위를 침범하지 않은 상태로 검증된다.

**Guardrails**

- 브라우저 byte 전송, Media Storage Service endpoint 변경, Post/Profile Representation 연결, UI, thumbnail/content delivery, 취소·삭제·orphan 정리와 Remote Media를 포함하지 않는다.
- 부모 PROD-435가 전체 lifecycle의 cross-service 배포 통합 검증과 OpenSpec archive를 계속 소유한다.

**Verification**

- 관련 단위·GraphQL schema·DB integration 테스트와 lint/type check를 통과시킨다.
- OpenSpec strict validation과 최종 scope diff review를 통과시킨다.
- correctness와 Ponytail review findings를 반영하거나 기각 근거를 기록한다.

- [x] 6.1 관련 테스트와 정적 검사를 실행하고 실패를 수정한다.
- [x] 6.2 OpenSpec strict validation, correctness review와 Ponytail review를 통과시킨다.
