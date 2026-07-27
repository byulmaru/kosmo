## Context

현재 API의 `POST /upload`는 multipart byte를 받아 Kosmo의 R2 client로 저장한 뒤 `file`과 `media` row를 함께 만든다. 저장소 전체를 확인한 결과 이 endpoint와 두 table의 Media/File 경로를 사용하는 production consumer는 없다. 반면 최신 canonical 계약은 Media Storage Service가 byte와 파일 표현을 소유하고, Kosmo의 한 Media가 `Uploading`에서 `Ready`로 전이하도록 정한다.

이 변경은 `PROD-439`의 시작 slice만 구현한다. Media Storage Service의 업로드 시작 API는 Kosmo가 Media를 만들기 전에 opaque 저장 참조, 제한된 upload URL, 만료 시각을 발급하는 외부 호출이다. 외부 호출과 PostgreSQL insert를 하나의 원자 transaction으로 묶을 수 없다는 제약이 있다.

## Goals / Non-Goals

**Goals:**

- 인증된 Account와 선택된 Local Profile에 결속된 Uploading Media를 만든다.
- 외부 저장 참조는 persistence에 숨기고 GraphQL에는 Media identity와 제한된 upload URL만 제공한다.
- 사용되지 않는 `/upload`, File table과 Kosmo 직접 R2 경계를 제거한다.
- `PROD-441`이 같은 Media를 Ready로 전환할 수 있는 최소 state persistence를 마련한다.

**Non-Goals:**

- 브라우저 또는 Kosmo가 이미지 byte를 Media Storage Service로 전송하는 구현
- 저장 완료 확인 endpoint 구현 또는 변경(`PROD-440`)
- Uploading Media의 Ready 전환(`PROD-441`)
- Post/Profile 연결, 이미지 조회 URL, thumbnail, Remote Media persistence
- 만료·취소·실패·orphan 정리 정책
- 기존 DB의 Media/File 데이터 존재 여부를 확인하는 배포 precondition

## Implementation Guidance

### Current Constraints

- 인증 context는 Active Account를 확인하지만 선택된 Profile의 membership, state와 Local Instance 조건은 mutation 경계에서 다시 확인해야 한다.
- 기존 `Media` schema는 state와 외부 저장 참조가 없고 File 및 미구현 Remote 필드를 포함한다.
- Media Storage Service 호출 성공 뒤 DB insert가 실패하면 consumer에게 노출되지 않은 외부 upload slot이 남을 수 있다. 현재 계약에는 취소 endpoint나 정리 정책이 없다.
- GraphQL Media object가 아직 없으므로 Node identity와 필요한 최소 field를 새로 연결해야 한다.

### Recommended Approach

`issueMediaUploadUrl` resolver에서 먼저 인증·행동 주체 조건을 확인하고 Media Storage Service의 `POST /v1/uploads`를 호출한다. 응답의 opaque 저장 참조, upload URL과 만료 시각을 runtime schema로 검증한 뒤 단일 insert로 Local/Uploading Media를 만든다. insert가 성공한 뒤에만 Media ref, upload URL과 만료 시각을 payload로 반환한다.

`media` persistence는 이번 slice가 실제로 쓰는 Account, Profile, source, state, opaque storage reference와 upload expiry만 보존한다. 기존 File 참조와 미구현 Remote projection은 제거한다. enum에는 canonical state인 `UPLOADING`, `READY`를 정의하되 이번 mutation은 `UPLOADING`만 쓰고 Ready 전환 전용 속성은 `PROD-441`에서 추가한다.

기존 REST route 등록, R2 helper/config/env와 File schema를 함께 제거하고 migration은 기존 Media row를 별도 검사 없이 삭제한다. 테스트는 production 환경 설정을 통한 외부 Media service client와 GraphQL 인증/schema를 확인하고, 격리된 test DB에서 실제 resolver의 권한·결속·Account 격리·외부 및 persistence 실패 순서를 실행한다.

### Allowed Alternatives

- resolver가 얇게 유지된다면 외부 호출과 Media 생성 orchestration을 core service로 분리할 수 있다.
- GraphQL payload의 Media는 이번 slice에 필요한 최소 field만 제공하거나 기존 Node resolver 관례에 맞춘 별도 Media ref로 제공할 수 있다. 어느 쪽도 raw 저장 참조를 노출해서는 안 된다.

### Known Traps

- 외부 저장 참조를 GraphQL ID로 사용하거나 upload URL에서 역산하지 않는다.
- Account ID만 저장하고 선택된 Profile 결속을 생략하지 않는다.
- 외부 호출 성공 직후 DB insert 전에 upload URL을 반환하지 않는다.
- 시작 mutation에서 storage 완료를 추측하거나 Media를 Ready로 만들지 않는다.
- 사용되지 않는 기존 Remote/File column을 미래 호환성 명목으로 유지하지 않는다.

## Risks / Trade-offs

- [외부 upload slot orphan] Media Service 성공 뒤 DB insert가 실패하면 접근되지 않은 slot이 남을 수 있다. → 성공 payload를 반환하지 않고, 정리는 만료 또는 별도 state 정책으로 후속 결정한다.
- [기존 schema의 destructive migration] File table과 기존 Media projection을 제거한다. → 확인된 production consumer가 없다는 전제와 사용자 승인에 따라 DB emptiness precondition 없이 단일 migration으로 교체한다.
- [후속 slice 의존] 이번 변경만으로 업로드된 Media는 Ready가 되지 않는다. → `PROD-440` 완료 확인 계약과 `PROD-441` 전환을 명시적 후속으로 유지한다.

## Migration Plan

1. Media state enum과 새 Local Uploading persistence를 추가하고 기존 Media/File projection을 제거하는 migration을 만든다.
2. Media Storage Service client와 GraphQL mutation/Media schema를 추가한다.
3. 기존 `/upload` route, R2 helper와 전용 환경 변수를 제거한다.
4. schema, resolver/service, migration 정적 검증과 OpenSpec strict validation을 실행하고, 격리된 test DB에서 GraphQL persistence 경로를 검증한다. 생성 migration history의 실행 검증과 DB emptiness precondition은 수행하지 않는다.
5. rollback은 애플리케이션과 schema migration을 함께 이전 revision으로 되돌리는 방식으로 수행한다. 이 변경 이후 생성된 Uploading Media의 역변환은 보장하지 않는다.

## Open Questions

없음.
