## REMOVED Requirements

### Requirement: 인증된 이미지 업로드 endpoint

**Authority / Provenance:** `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`

**Reason**: Kosmo가 이미지 byte를 받는 사용되지 않는 `POST /upload` 대신 Media Storage Service가 byte 저장을 소유한다.

**Migration**: Kosmo consumer는 `issueMediaUploadUrl`로 Uploading Media와 제한된 upload URL을 받은 뒤 Media Storage Service에 byte를 전송한다.

### Requirement: multipart 이미지 입력 검증

**Authority / Provenance:** `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-435`, `PROD-439`

**Reason**: 이미지 byte, 형식과 크기 검증은 Media Storage Service가 소유한다.

**Migration**: Kosmo는 multipart 이미지 요청을 받지 않으며 Media Storage Service가 발급한 upload URL을 사용한다.

### Requirement: R2 object storage

**Authority / Provenance:** `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-435`, `PROD-439`

**Reason**: storage key, bucket과 byte 저장은 Media Storage Service의 내부 책임이다.

**Migration**: Kosmo는 Media Storage Service의 opaque 저장 참조만 Local Media persistence에 보존한다.

### Requirement: 로컬 media persistence

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`

**Reason**: 별도 File row와 저장 완료 뒤 Media를 동시에 만드는 모델을 하나의 Media state로 대체한다.

**Migration**: 업로드 시작 시 Uploading Media 하나를 만들고, 후속 완료 동작에서 같은 Media를 Ready로 전환한다.

### Requirement: 리모트 media model 호환성

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`

**Reason**: 구현되지 않은 Remote Media projection을 Local upload persistence에 미리 포함하지 않는다.

**Migration**: Remote Media persistence는 실제 Remote Media 저장 구현에서 canonical Source/Ready 계약에 따라 별도로 정의한다.

### Requirement: 업로드 응답 계약

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0014-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`

**Reason**: Kosmo의 storage key, public URL과 content type 응답은 외부 저장 경계 및 Media identity 계약과 맞지 않는다.

**Migration**: `issueMediaUploadUrl`은 Kosmo Media identity, 제한된 upload URL과 만료 시각만 반환한다.
