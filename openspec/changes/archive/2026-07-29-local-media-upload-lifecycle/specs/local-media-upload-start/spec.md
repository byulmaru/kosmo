## ADDED Requirements

### Requirement: 인증된 Local Media 업로드 시작

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439` Kosmo는 인증된 Active Account의 선택된 Active/Normal Profile이 `issueMediaUploadUrl` GraphQL mutation으로 Local Media upload URL을 발급받을 수 있게 해야 한다(MUST).

#### Scenario: 유효한 업로드 시작

- **WHEN** 인증된 Active Account가 선택된 Active/Normal Profile로 `issueMediaUploadUrl`을 요청한다
- **THEN** 시스템은 Media Storage Service에서 제한된 업로드 권한을 발급받는다
- **AND** `Source=Local`, `State=Uploading`인 Media를 생성한다
- **AND** Media를 요청 Account와 선택된 Profile에 결속한다

#### Scenario: 인증되지 않은 요청

- **WHEN** 유효한 Account session 없이 `issueMediaUploadUrl`을 요청한다
- **THEN** 시스템은 업로드 권한이나 Media를 생성하지 않고 인증 오류를 반환한다

#### Scenario: 유효한 행동 주체가 없는 요청

- **WHEN** 인증된 Account에 선택된 Profile이 없거나 선택된 Profile이 Active/Normal 상태가 아니다
- **THEN** 시스템은 업로드 권한이나 Media를 생성하지 않고 권한 오류를 반환한다

### Requirement: Uploading Media와 외부 업로드 권한의 결속

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `PROD-435`, `PROD-439` Kosmo는 Media Storage Service가 발급한 opaque 저장 참조와 만료 시각을 새 Uploading Media에 영속화해야 하며(MUST), raw 저장 참조를 GraphQL consumer에게 노출하면 안 된다(MUST NOT).

#### Scenario: 외부 업로드 권한 발급 성공

- **WHEN** Media Storage Service가 opaque 저장 참조, 제한된 upload URL, 만료 시각을 반환한다
- **THEN** 시스템은 opaque 저장 참조와 만료 시각을 새 Uploading Media에 저장한다
- **AND** 저장 참조는 Media identity나 권한의 대체물로 사용되지 않는다

#### Scenario: 외부 업로드 권한 발급 실패

- **WHEN** Media Storage Service가 업로드 시작 요청을 실패하거나 유효하지 않은 응답을 반환한다
- **THEN** 시스템은 Media를 생성하지 않는다
- **AND** mutation은 성공 payload를 반환하지 않는다

#### Scenario: Media persistence 실패

- **WHEN** 외부 업로드 권한 발급 뒤 Uploading Media 영속화가 실패한다
- **THEN** mutation은 성공 payload와 upload URL을 반환하지 않는다

### Requirement: 업로드 시작 응답

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439` 성공한 `issueMediaUploadUrl` mutation은 생성된 Kosmo Media identity, 제한된 upload URL, 만료 시각을 반환해야 한다(MUST).

#### Scenario: 성공 payload

- **WHEN** 외부 업로드 권한 발급과 Uploading Media 영속화가 모두 성공한다
- **THEN** mutation은 `media`, `uploadUrl`, `expiresAt`을 반환한다
- **AND** 반환된 Media의 state는 `UPLOADING`이다
- **AND** payload는 Media Storage Service의 raw 저장 참조를 포함하지 않는다

### Requirement: Account와 Profile 경계 보존

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439` 각 Local Media는 업로드를 요청한 Account와 요청 시 선택된 Profile을 별도로 보존해야 한다(MUST).

#### Scenario: 같은 Account의 다른 Profile

- **WHEN** 같은 Account가 서로 다른 선택된 Profile로 각각 업로드를 시작한다
- **THEN** 각 Media의 Upload Account는 동일하다
- **AND** 각 Media의 Profile은 요청 시 선택된 Profile이다

#### Scenario: 다른 Account의 Media

- **WHEN** 서로 다른 Account가 업로드를 시작한다
- **THEN** 각 Media는 요청한 Account에만 Upload Account로 결속된다

### Requirement: 업로드 시작 범위 제한

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-435`, `PROD-439`, `PROD-441` 업로드 시작은 새 Media를 `Uploading`으로만 생성해야 하며(MUST), 저장 완료 확인이나 `Ready` 전환 또는 제품 관계 연결을 수행하면 안 된다(MUST NOT).

#### Scenario: 시작 직후 state

- **WHEN** `issueMediaUploadUrl`이 성공한다
- **THEN** 생성된 Media는 `Uploading`이다
- **AND** Post Attached Media나 Profile Representation으로 연결되지 않는다
