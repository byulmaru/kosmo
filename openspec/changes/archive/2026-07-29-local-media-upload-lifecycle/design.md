## Context

현재 API의 `POST /upload`는 multipart byte를 받아 Kosmo의 R2 client로 저장한 뒤 `file`과 `media` row를 함께 만든다. 저장소 전체를 확인한 결과 이 endpoint와 두 table의 Media/File 경로를 사용하는 production consumer는 없다. 반면 최신 canonical 계약은 Media Storage Service가 byte와 파일 표현을 소유하고, Kosmo의 한 Media가 `Uploading`에서 `Ready`로 전이하도록 정한다.

이 변경은 `PROD-439`의 시작 slice에 이어 `PROD-441`의 완료 slice를 구현한다. Media Storage Service의 업로드 시작 API는 Kosmo가 Media를 만들기 전에 opaque 저장 참조, 제한된 upload URL, 만료 시각을 발급하는 외부 호출이다. 완료 endpoint는 저장 참조에 해당하는 immutable 원본이 저장됐는지만 알려 주며 Kosmo Media identity나 Account/Profile 소유권을 증명하지 않는다. 외부 HTTP 확인과 PostgreSQL update를 하나의 transaction으로 묶을 수 없다는 제약이 있다.

## Goals / Non-Goals

**Goals:**

- 인증된 Account와 선택된 Profile에 결속된 Uploading Media를 만든다.
- 외부 저장 참조는 persistence에 숨기고 GraphQL에는 Media identity와 제한된 upload URL만 제공한다.
- 사용되지 않는 `/upload`, File table과 Kosmo 직접 R2 경계를 제거한다.
- `PROD-441`이 같은 Media를 Ready로 전환할 수 있는 최소 state persistence를 마련한다.
- 요청 Account가 소유한 Local/Uploading Media만 외부 저장 완료를 확인하고 같은 identity로 Ready 전환한다.
- Ready 전환과 `readyAt` 기록을 하나의 conditional update로 적용하고 반복 완료 요청을 멱등 처리한다.

**Non-Goals:**

- 브라우저 또는 Kosmo가 이미지 byte를 Media Storage Service로 전송하는 구현
- 저장 완료 확인 endpoint 구현 또는 변경(`PROD-440`)
- Post/Profile 연결, 이미지 조회 URL, thumbnail, Remote Media persistence
- 만료·취소·실패·orphan 정리 정책
- 기존 DB의 Media/File 데이터 존재 여부를 확인하는 배포 precondition

## Implementation Guidance

### Current Constraints

- 인증 context는 Active Account, 선택된 Profile의 membership과 조회 가능 상태를 확인한다. mutation resolver는 이 조건을 별도 actor query로 반복 검증하지 않는다.
- 기존 `Media` schema는 state와 외부 저장 참조가 없고 File 및 미구현 Remote 필드를 포함한다.
- Media Storage Service 호출 성공 뒤 DB insert가 실패하면 consumer에게 노출되지 않은 외부 upload slot이 남을 수 있다. 현재 계약에는 취소 endpoint나 정리 정책이 없다.
- GraphQL Media object가 아직 없으므로 Node identity와 필요한 최소 field를 새로 연결해야 한다.
- 완료 mutation은 요청 Account와 Media Upload Account가 같은지 Media row에서 확인하되, `usingProfile`이 이미 보장한 Account/Profile context를 별도 actor query로 반복 검증하지 않는다.
- Media Storage Service의 opaque 저장 참조는 provider가 정한 값이므로 Kosmo가 형식을 해석하거나 재검증하지 않는다. endpoint path segment로 전달할 때만 URL encoding한다.

### Recommended Approach

`issueMediaUploadUrl` resolver에서 먼저 인증·행동 주체 조건을 확인하고 Media Storage Service의 `POST /v1/uploads`를 직접 호출한다. 외부 호출은 client request 취소와 10초 deadline을 함께 적용한다. 응답에서는 비어 있지 않은 opaque 저장 참조, upload URL과 만료 시각만 추출하고 provider가 추가한 필드는 허용한다. upload URL은 URL 구조를 검증하고, 만료 시각은 persistence와 GraphQL `DateTime`에 필요한 `Temporal.Instant`로 변환한 뒤 단일 insert로 Local/Uploading Media를 만든다. insert가 성공한 뒤에만 Media ref, upload URL과 만료 시각을 payload로 반환한다. 현재 caller가 이 resolver 하나뿐이므로 별도 Storage client abstraction은 두지 않는다.

`media` persistence는 이번 slice가 실제로 쓰는 Account, Profile, source, state, opaque storage reference와 upload expiry만 보존한다. 기존 File 참조와 미구현 Remote projection은 제거한다. enum에는 canonical state인 `UPLOADING`, `READY`를 정의하되 이번 mutation은 `UPLOADING`만 쓰고 Ready 전환 전용 속성은 `PROD-441`에서 추가한다.

기존 REST route 등록, R2 helper/config/env와 File schema를 함께 제거하고 migration은 기존 Media row를 별도 검사 없이 삭제한다. 테스트는 격리된 test DB에서 production 환경 설정과 전역 fetch를 사용하는 실제 resolver의 HTTP 요청, 권한·결속·Account 격리·외부 및 persistence 실패 순서를 실행하고 GraphQL 인증/schema를 함께 확인한다.

`completeMediaUpload`는 Media global ID 하나를 입력받고 먼저 요청 Account가 소유한 Local Media를 조회한다. 이미 `READY`이면 외부 확인이나 write 없이 같은 Media를 반환한다. `UPLOADING`이면 persistence-only 저장 참조를 URL path segment로 인코딩해 Media Storage Service의 `HEAD /v1/uploads/:id`를 호출한다. `204`만 저장 완료로 인정하고 `404`는 미완료, 그 밖의 응답과 network 실패는 외부 확인 실패로 처리한다.

저장 완료 뒤에는 `id`, 요청 Account, `LOCAL`, `UPLOADING`을 조건으로 한 단일 update에서 `state=READY`와 `readyAt`을 함께 기록한다. 동시 요청의 conditional update가 결과를 반환하지 않으면 같은 Account가 소유한 row를 다시 읽어 이미 `READY`인 경우 그 결과를 반환한다. 이 방식은 외부 호출을 DB transaction이나 lock 안에 넣지 않으면서 첫 성공 전환의 `readyAt`을 보존한다. update 자체가 실패하면 PostgreSQL statement 원자성에 따라 Uploading state와 null `readyAt`이 유지된다.

### Allowed Alternatives

- resolver가 얇게 유지된다면 외부 호출과 Media 생성 orchestration을 core service로 분리할 수 있다.
- GraphQL payload의 Media는 이번 slice에 필요한 최소 field만 제공하거나 기존 Node resolver 관례에 맞춘 별도 Media ref로 제공할 수 있다. 어느 쪽도 raw 저장 참조를 노출해서는 안 된다.

### Known Traps

- 외부 저장 참조를 GraphQL ID로 사용하거나 upload URL에서 역산하지 않는다.
- Account ID만 저장하고 선택된 Profile 결속을 생략하지 않는다.
- 외부 호출 성공 직후 DB insert 전에 upload URL을 반환하지 않는다.
- 시작 mutation에서 storage 완료를 추측하거나 Media를 Ready로 만들지 않는다.
- 저장 완료 endpoint를 호출하기 전에 Media를 Ready로 바꾸거나 외부 호출을 DB transaction 안에서 수행하지 않는다.
- 이미 Ready인 멱등 요청에서 `readyAt`을 덮어쓰거나 저장 완료를 다시 확인하지 않는다.
- 완료 요청의 선택 Profile과 Media Profile이 같아야 한다는 새 제약을 추가하지 않는다. 권한은 Upload Account가 소유한다.
- 사용되지 않는 기존 Remote/File column을 미래 호환성 명목으로 유지하지 않는다.

## Risks / Trade-offs

- [외부 upload slot orphan] Media Service 성공 뒤 DB insert가 실패하면 접근되지 않은 slot이 남을 수 있다. → 성공 payload를 반환하지 않고, 정리는 만료 또는 별도 state 정책으로 후속 결정한다.
- [기존 schema의 destructive migration] File table과 기존 Media projection을 제거한다. → 확인된 production consumer가 없다는 전제와 사용자 승인에 따라 DB emptiness precondition 없이 단일 migration으로 교체한다.
- [부모 통합 의존] 이 변경은 Kosmo 내부 Ready 전환까지만 제공한다. → 실제 브라우저 전송부터 두 서비스 배포 환경까지의 cross-service 통합 검증과 archive는 `PROD-435`에서 수행한다.
- [외부 확인 뒤 persistence 실패] 저장 완료는 외부에 남지만 Media는 Uploading으로 유지될 수 있다. → 성공 결과를 반환하지 않고 동일 완료 mutation을 재시도해 다시 확인·전환한다.
- [동시 완료 요청] 여러 요청이 같은 Uploading Media를 동시에 확인할 수 있다. → conditional update의 한 요청만 최초 전환하고 나머지는 저장된 Ready 결과를 다시 읽는다.

## Migration Plan

1. Media state enum과 새 Local Uploading persistence를 추가하고 기존 Media/File projection을 제거하는 migration을 만든다.
2. Media Storage Service 호출 경계와 GraphQL mutation/Media schema를 추가한다.
3. 기존 `/upload` route, R2 helper와 전용 환경 변수를 제거한다.
4. schema, resolver/service, migration 정적 검증과 OpenSpec strict validation을 실행하고, 격리된 test DB에서 GraphQL persistence 경로를 검증한다. 생성 migration history의 실행 검증과 DB emptiness precondition은 수행하지 않는다.
5. rollback은 애플리케이션과 schema migration을 함께 이전 revision으로 되돌리는 방식으로 수행한다. 이 변경 이후 생성된 Uploading Media의 역변환은 보장하지 않는다.
6. nullable `ready_at`을 additive migration으로 추가하고 완료 mutation에서 state와 함께 갱신한다. rollback 시 애플리케이션을 먼저 이전 revision으로 되돌린 뒤 column을 제거할 수 있다.

## Open Questions

없음.
