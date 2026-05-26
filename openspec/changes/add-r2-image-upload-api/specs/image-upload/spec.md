## ADDED Requirements

### Requirement: 인증된 이미지 업로드 endpoint

API는 이미지 업로드를 위한 루트 `POST /upload` endpoint를 제공해야 하며, 기존 bearer token 요청 context에서 파생된 유효한 인증 session을 요구해야 한다(MUST).

#### Scenario: 인증된 업로드 요청

- **WHEN** 클라이언트가 유효한 `Authorization: Bearer <token>` header와 이미지 파일로 `POST /upload`를 보낸다
- **THEN** 시스템은 업로드 처리를 위해 요청을 수락한다

#### Scenario: anonymous 업로드 요청

- **WHEN** 클라이언트가 유효한 인증 session 없이 `POST /upload`를 보낸다
- **THEN** 시스템은 HTTP 401 JSON error response를 반환한다

### Requirement: multipart 이미지 입력 검증

Upload endpoint는 `image`라는 단일 file field를 가진 `multipart/form-data`를 받아야 하며, 이미지 파일 MIME type으로 보이지 않는 입력은 거부해야 한다(MUST).

#### Scenario: image field 누락

- **WHEN** 인증된 클라이언트가 `image` file field 없이 `POST /upload`를 보낸다
- **THEN** 시스템은 HTTP 400 JSON error response를 반환한다

#### Scenario: 이미지가 아닌 MIME type

- **WHEN** 인증된 클라이언트가 `image/*` MIME type이 아닌 파일을 업로드한다
- **THEN** 시스템은 HTTP 400 JSON error response를 반환한다

#### Scenario: 업로드 크기 초과

- **WHEN** 인증된 클라이언트가 endpoint 정책 상수의 최대 업로드 크기보다 큰 이미지를 업로드한다
- **THEN** 시스템은 HTTP 413 JSON error response를 반환한다

### Requirement: R2 object storage

Upload endpoint는 입력 파일 stream을 설정된 Cloudflare R2 bucket에 서버 생성 object key로 저장해야 하며 client filename을 storage key로 사용하면 안 된다(MUST NOT).

#### Scenario: accepted image 저장

- **WHEN** 인증된 클라이언트가 이미지 파일을 업로드한다
- **THEN** 시스템은 입력 파일 stream을 설정된 R2 bucket에 쓴다
- **AND** object key는 서버가 생성한다
- **AND** object key는 `uploads/`로 시작하고 업로드 year/month를 포함한다

#### Scenario: R2 write 실패

- **WHEN** 유효한 업로드 처리 중 R2 storage가 실패한다
- **THEN** 시스템은 HTTP 502 JSON error response를 반환한다

### Requirement: 로컬 media persistence

Upload endpoint는 성공한 로컬 업로드마다 persisted `File` record와 persisted `Media` record를 생성해야 하며 upload ownership과 R2 object metadata를 저장해야 한다(MUST).

#### Scenario: 로컬 media 저장

- **WHEN** 인증된 클라이언트가 이미지 파일을 업로드하고 R2 storage가 성공한다
- **THEN** 시스템은 업로드된 R2 object에 대한 file row 1개를 저장한다
- **AND** 시스템은 인증된 account에 연결된 `source = LOCAL` media row를 저장한다
- **AND** request context에 actor profile ID가 있으면 저장한다
- **AND** media row는 업로드된 file row를 `originalFileId`로 참조한다
- **AND** file row는 R2 object key, public URL, MIME type, byte size를 저장한다
- **AND** file row의 width, height, SHA-256은 후속 처리 전까지 비어 있을 수 있다
- **AND** media row의 thumbnail file ref와 thumbhash는 후속 이미지 처리 전까지 비어 있을 수 있다

### Requirement: 리모트 media model 호환성

Upload에서 사용하는 data model은 즉시 로컬 R2 file을 요구하지 않고도 리모트 ActivityPub media를 지원해야 한다(MUST).

#### Scenario: 리모트 media metadata 저장

- **WHEN** 시스템이 lazy proxy 처리 전 리모트 ActivityPub 이미지를 기록한다
- **THEN** 시스템은 `source = REMOTE`, remote URL, optional remote actor ID, remote fetched timestamp를 가진 media row를 저장할 수 있다
- **AND** file references는 비어 있을 수 있다
- **AND** thumbhash는 리모트 이미지 처리 전까지 비어 있을 수 있다

### Requirement: 업로드 응답 계약

Upload endpoint는 성공한 업로드에 대해 media ID, file key, public URL, content type을 포함한 JSON metadata를 반환해야 한다(SHALL).

#### Scenario: 성공 응답

- **WHEN** 인증된 클라이언트가 이미지 파일을 업로드하고 R2 storage가 성공한다
- **THEN** 시스템은 HTTP 201 JSON response를 반환한다
- **AND** response는 생성된 local media에 대한 `id`, `key`, `url`, `contentType` field를 포함한다
- **AND** response는 byte size, width, height, thumbnail, thumbhash field를 포함하지 않는다
