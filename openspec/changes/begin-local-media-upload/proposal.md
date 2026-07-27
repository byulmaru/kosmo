## Why

Kosmo 내부가 이미지 byte와 File 표현을 직접 저장하는 기존 `/upload` 계약은 실제 consumer가 없고, 이미지 저장 책임이 Media Storage Service로 이동한 현재 경계와 맞지 않는다. `PROD-439`에서는 별도 upload claim이나 File 없이 인증된 Account가 하나의 Local Media를 `Uploading` 상태로 만들고 외부 업로드 권한을 받는 시작 동작을 제공한다.

## What Changes

- 인증된 Account의 선택된 Local Profile을 행동 주체로 `Source=Local`, `State=Uploading` Media를 생성하는 `issueMediaUploadUrl` GraphQL mutation을 추가한다.
- Media Storage Service에 업로드를 시작해 받은 opaque 저장 참조, 제한된 upload URL, 만료 시각을 Media 생성과 결속한다.
- mutation 응답에는 Kosmo의 Media identity, upload URL, 만료 시각을 반환하고 raw 저장 참조는 공개하지 않는다.
- **BREAKING** 실제 consumer가 없는 기존 `POST /upload` multipart API와 Kosmo의 직접 R2 저장 계약을 제거한다.
- **BREAKING** Kosmo의 File persistence와 Local Media의 File 참조 계약을 제거한다.
- 저장 완료 확인, `Uploading -> Ready` 전환, Post/Profile 연결, 브라우저의 byte 전송은 이 변경에 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`
- Linear Contract: `PROD-435`
- Linear Implementations: `PROD-439` (현재 변경), `PROD-440` (외부 저장 완료 확인 endpoint, 후속 통합 의존성), `PROD-441` (Ready 전환, 후속)

## Capabilities

### New Capabilities

- `local-media-upload-start`: 인증된 Account가 선택된 Local Profile로 외부 업로드 권한과 결속된 Uploading Media를 생성하는 계약

### Modified Capabilities

- `image-upload`: 사용되지 않는 Kosmo 직접 multipart/R2/File 업로드 계약을 제거한다.

## Impact

- GraphQL schema와 resolver, 인증 session의 Account/Profile 경계
- PostgreSQL `media` persistence와 사용되지 않는 `files` persistence
- Media Storage Service의 upload 시작 API client
- 기존 REST `/upload`, R2 client/configuration과 관련 테스트
- 후속 `PROD-441`이 사용할 동일 Media identity와 state persistence
