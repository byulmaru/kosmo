## ADDED Requirements

### Requirement: 공통 이미지 업로드 오류 분류

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/design/media-upload-errors.md`, `PROD-657` — 유니버설 앱은 이미지 업로드 실패를 `issue | transfer | complete` 단계와 `unsupported-format | file-too-large | image-too-large | invalid-image | transient` 사용자-facing 원인의 조합으로 분류해야 한다(MUST). signed PUT의 non-2xx 응답은 HTTP status와 `{ error: { code } }` shape의 allowlist가 모두 일치할 때만 세분해야 하며(MUST), 응답의 `error.message`나 그 밖의 원문 detail을 사용자-facing 결과에 사용하면 안 된다(MUST NOT).

#### Scenario: 정상 signed PUT 응답

- **WHEN** signed PUT이 `2xx` 응답을 반환한다
- **THEN** 앱은 응답을 transfer 성공으로 처리한다
- **AND** 오류 body parsing이나 사용자 오류 분류를 실행하지 않는다

#### Scenario: 지원 형식 오류 분류

- **WHEN** signed PUT이 `415`와 `unsupported_image` 또는 `content_type_mismatch` code를 반환한다
- **THEN** 앱은 실패를 `transfer + unsupported-format`으로 분류한다

#### Scenario: 파일 용량 오류 분류

- **WHEN** signed PUT이 `413`과 `size_limit_exceeded` code를 반환한다
- **THEN** 앱은 실패를 `transfer + file-too-large`로 분류한다

#### Scenario: 이미지 해상도 오류 분류

- **WHEN** signed PUT이 `422`와 `pixel_limit_exceeded` 또는 `dimension_limit_exceeded` code를 반환한다
- **THEN** 앱은 실패를 `transfer + image-too-large`로 분류한다

#### Scenario: 손상 이미지 오류 분류

- **WHEN** signed PUT이 `422`와 `invalid_image` code를 반환한다
- **THEN** 앱은 실패를 `transfer + invalid-image`로 분류한다

#### Scenario: 알려진 code와 status가 일치하지 않는 응답

- **WHEN** signed PUT의 code는 알려져 있지만 HTTP status가 allowlist 조합과 일치하지 않는다
- **THEN** 앱은 그 응답을 `transfer + transient`로 분류한다
- **AND** 알려진 code만으로 원인을 추측하지 않는다

#### Scenario: 안전하게 세분할 수 없는 transfer 실패

- **WHEN** signed PUT이 네트워크에서 실패하거나 `5xx`, unknown code/status, 빈 body 또는 유효하지 않은 JSON을 반환한다
- **THEN** 앱은 실패를 `transfer + transient`로 분류한다
- **AND** JSON parsing 실패를 별도 사용자 오류로 노출하지 않는다

#### Scenario: 발급과 완료 확인 단계 실패

- **WHEN** `issueMediaUploadUrl` 또는 `completeMediaUpload`이 실패한다
- **THEN** 앱은 각각 `issue + transient` 또는 `complete + transient`로 분류한다
- **AND** byte PUT 실패와 같은 단계로 합치지 않는다

### Requirement: 안전한 공통 한국어 안내

**Authority / Provenance:** `docs/design/media-upload-errors.md`, `docs/design/profile-edit.md`, `PROD-657` — 유니버설 앱은 외부 응답에서 가져오지 않은 안전한 UI `{subject}`와 공통 단계·원인으로 한국어 오류 문구를 생성해야 한다(MUST). `unsupported-format`은 지원하지 않는 이미지 형식임을, `file-too-large`는 16 MiB 상한을, `image-too-large`는 더 작은 해상도 선택을, `invalid-image`는 다른 이미지 선택을 안내해야 하며(MUST), `transient`는 `issue | transfer | complete` 단계에 맞는 재시도를 안내해야 한다(MUST).

#### Scenario: 원인별 다음 행동 안내

- **WHEN** transfer 실패가 네 가지 세분 가능한 사용자-facing 원인 중 하나로 분류된다
- **THEN** 앱은 `{subject}`와 해당 원인에 맞는 canonical 한국어 문구를 표시한다
- **AND** 형식·용량·해상도·손상 원인을 transient 문구로 합치지 않는다

#### Scenario: 단계별 transient 안내

- **WHEN** transient 실패가 `issue`, `transfer` 또는 `complete` 단계에서 발생한다
- **THEN** 앱은 각각 업로드 시작, byte 업로드 또는 업로드 확인이 실패했음을 구분해 안내한다
- **AND** 잠시 후 같은 항목이나 field를 다시 시도할 수 있음을 안내한다

#### Scenario: Storage Service 원문 비노출

- **WHEN** 실패 응답에 `error.message`, upload token, URL, request header 또는 내부 식별자가 포함된다
- **THEN** 앱은 canonical `{subject}`와 공통 한국어 문구만 표시한다
- **AND** 외부 원문이나 내부 정보를 화면 문구와 accessible name에 포함하지 않는다

### Requirement: consumer별 실패 보존과 명시적 재시도

**Authority / Provenance:** `docs/design/media-upload-errors.md`, `docs/design/profile-edit.md`, `docs/domain/objects/media.md`, `PROD-657`, `PROD-553`, `PROD-492` — Post Composer와 Profile 편집은 같은 오류 분류·문구·새 URL 재시도 정책을 사용해야 한다(MUST). 실패한 항목이나 field의 현재 draft와 다른 성공 결과를 보존해야 하며(MUST), 자동 재시도하거나 실패한 signed URL을 재사용하면 안 된다(MUST NOT).

#### Scenario: Post Composer 항목 실패 보존

- **WHEN** 선택한 Composer 이미지의 업로드가 어느 단계에서든 실패한다
- **THEN** Composer는 그 항목의 preview, 선택 순서와 실패 분류를 유지한다
- **AND** 해당 항목에만 재시도와 제거 action을 제공한다
- **AND** 다른 Ready 항목을 다시 업로드하지 않는다

#### Scenario: Profile 이미지 field 실패 보존

- **WHEN** avatar 또는 header 한 field의 업로드가 실패한다
- **THEN** Profile 편집은 실패 field의 local preview와 다른 Ready field, text·policy draft를 유지한다
- **AND** 실패 field에만 재시도 action을 제공하고 upload가 Ready가 될 때까지 Profile 저장을 실행하지 않는다

#### Scenario: 실패 항목 명시적 재시도

- **WHEN** 사용자가 실패한 Composer 항목이나 Profile field의 재시도를 실행한다
- **THEN** 앱은 그 대상에 새 Uploading Media와 새 제한 URL을 발급한다
- **AND** `issue → transfer → complete` 전체 순서를 다시 실행한다
- **AND** 이전 실패 URL이나 다른 Ready 대상의 업로드 결과를 재사용하지 않는다

### Requirement: 업로드 오류 접근성 정렬

**Authority / Provenance:** `docs/design/media-upload-errors.md`, `docs/design/accessibility.md`, `PROD-657` — 이미지 업로드 오류 UI는 보이는 문구, alert와 action의 accessible name이 같은 실패 대상과 복구 행동을 가리키게 해야 한다(MUST). 새 실패는 보조 기술에 alert로 전달해야 하며(MUST), 같은 실패를 단순 rerender마다 중복 announcement하면 안 된다(MUST NOT).

#### Scenario: 새 실패 alert

- **WHEN** 이미지 항목이나 field가 새 실패 상태로 전환된다
- **THEN** 오류 문구는 해당 `{subject}`와 사용자-facing 원인을 식별하는 alert로 한 번 전달된다
- **AND** 색상만으로 실패 원인이나 상태를 전달하지 않는다

#### Scenario: 대상이 분명한 재시도 action

- **WHEN** 실패한 이미지에 재시도 action을 표시한다
- **THEN** accessible name은 `{subject} 업로드 다시 시도`처럼 대상과 행동을 함께 식별한다
- **AND** 같은 화면의 다른 실패 항목이나 field와 구분된다
