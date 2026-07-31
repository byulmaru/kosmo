## Why

Kosmo 내부가 이미지 byte와 File 표현을 직접 저장하는 기존 `/upload` 계약은 실제 consumer가 없고, 이미지 저장 책임이 Media Storage Service로 이동한 현재 경계와 맞지 않는다. `PROD-439`에서는 별도 upload claim이나 File 없이 인증된 Account가 하나의 Local Media를 `Uploading` 상태로 만들고 외부 업로드 권한을 받는 시작 동작을 제공한다. `PROD-441`에서는 Media Storage Service가 저장 완료를 확인한 같은 Media를 `Ready`로 전환해 Local Media 업로드의 Kosmo 내부 lifecycle을 완성한다.

## What Changes

- 인증된 Account의 선택된 Profile을 행동 주체로 `Source=Local`, `State=Uploading` Media를 생성하는 `issueMediaUploadUrl` GraphQL mutation을 추가한다.
- Media Storage Service에 업로드를 시작해 받은 opaque 저장 참조, 제한된 upload URL, 만료 시각을 Media 생성과 결속한다.
- mutation 응답에는 Kosmo의 Media identity, upload URL, 만료 시각을 반환하고 raw 저장 참조는 공개하지 않는다.
- 인증된 요청 Account가 소유한 Local/Uploading Media의 저장 완료를 Media Storage Service에서 확인하고 같은 Media를 `Ready`로 전환하는 `completeMediaUpload` GraphQL mutation을 추가한다.
- 완료 전환은 `readyAt`을 함께 기록하고, 같은 Account의 반복 요청에는 이미 전환된 같은 Ready Media를 반환한다.
- **BREAKING** 실제 consumer가 없는 기존 `POST /upload` multipart API와 Kosmo의 직접 R2 저장 계약을 제거한다.
- **BREAKING** Kosmo의 File persistence와 Local Media의 File 참조 계약을 제거한다.
- Post/Profile 연결, 브라우저의 byte 전송과 Media Storage Service endpoint 자체 변경은 이 변경에 포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`
- Linear Contract: `PROD-435`
- Linear Implementations: `PROD-439` (Uploading 생성, 완료), `PROD-440` (외부 저장 완료 확인 endpoint, 완료), `PROD-441` (Ready 전환, 현재 slice)

## Capabilities

### New Capabilities

- `local-media-upload-start`: 인증된 Account가 선택된 Profile로 외부 업로드 권한과 결속된 Uploading Media를 생성하는 계약
- `local-media-upload-completion`: 요청 Account가 소유한 Uploading Media의 저장 완료를 확인하고 같은 Media를 Ready로 전환하는 계약

### Modified Capabilities

- `image-upload`: 사용되지 않는 Kosmo 직접 multipart/R2/File 업로드 계약을 제거한다.

## Impact

- GraphQL schema와 resolver, 인증 session의 Account/Profile 경계
- PostgreSQL `media` persistence와 사용되지 않는 `files` persistence
- Media Storage Service의 upload 시작 API를 호출하는 GraphQL resolver 경계
- 기존 REST `/upload`, R2 client/configuration과 관련 테스트
- Media Storage Service의 저장 완료 endpoint를 호출하는 GraphQL resolver 경계
- 동일 Media의 conditional Ready 전환과 `readyAt` persistence
