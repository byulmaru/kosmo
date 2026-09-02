# post-composer-media-upload Specification

## Purpose

유니버설 Post Composer에서 최대 4개 이미지를 선택·업로드하고 preview, Alt Text와 Sensitive Media 상태를 관리해 `createPost`에 제출하는 사용자 흐름을 정의한다.

## Requirements

### Requirement: Composer Local Media 직접 업로드

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/design/media-upload-errors.md`, PROD-461, PROD-553, PROD-657, PROD-881 — 유니버설 앱은 Post Composer의 picker와 Web clipboard에서 받은 각 이미지를 공통 업로드 경계에서 긴 변 최대 `2048px`와 품질 `0.8`의 WebP byte로 정규화하고 Kosmo가 발급한 제한된 URL로 Media Storage Service에 직접 전송해 같은 Media를 Ready로 완료해야 하며(MUST), Kosmo API를 byte proxy로 사용하면 안 된다(MUST NOT). 실패하면 공통 이미지 업로드 오류 정책으로 단계·원인을 분류하고 해당 항목에만 안전한 안내와 재시도를 제공해야 한다(MUST).

#### Scenario: 선택 즉시 업로드 성공

- **WHEN** 사용자가 picker에서 이미지를 선택하거나 Web clipboard 이미지를 붙여넣는다
- **THEN** 앱은 `issueMediaUploadUrl`로 Uploading Media와 제한된 upload URL을 받는다
- **AND** 공통 이미지 업로드 경계가 선택 이미지를 크기와 WebP 형식으로 정규화한다
- **AND** 정규화한 이미지 byte를 `image/webp` Content-Type으로 upload URL에 직접 `PUT`한다
- **AND** PUT 성공 뒤 같은 Media global ID로 `completeMediaUpload`을 호출한다
- **AND** Ready 응답을 받은 항목만 Post 작성 후보로 표시한다

#### Scenario: 업로드 실패와 재시도

- **WHEN** 업로드 시작, 이미지 정규화, byte PUT 또는 완료 확인이 실패한다
- **THEN** 앱은 해당 이미지의 미리보기, 선택 순서와 실패 상태를 유지한다
- **AND** 실패 단계와 허용된 signed PUT status/code에 따른 공통 사용자-facing 원인·한국어 안내를 표시한다
- **AND** Storage Service의 원문 message나 내부 정보를 표시하지 않는다
- **AND** 사용자는 해당 항목만 재시도하거나 Composer에서 제거할 수 있다
- **AND** 재시도는 새 Uploading Media와 새 제한 URL을 발급받아 전체 순서를 다시 실행한다

#### Scenario: 제거와 orphan 경계

- **WHEN** 사용자가 업로드 중이거나 Ready인 이미지를 Composer에서 제거한다
- **THEN** 앱은 그 항목을 현재 Post 작성 입력에서 제거한다
- **AND** 늦게 완료된 비동기 결과가 제거한 항목을 Composer에 다시 추가하지 않는다
- **AND** 앱은 upload 취소, Media 삭제 또는 외부 object 삭제를 요청하지 않는다

### Requirement: Composer 이미지 선택과 항목 상태

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/post-content.md`, `docs/design/accessibility.md`, `docs/design/media-upload-errors.md`, PROD-461, PROD-553, PROD-657 — 유니버설 앱은 Web/iOS/Android 갤러리 이미지 선택을 제공하고 현재 Composer에서 최대 4개의 항목을 선택 순서대로 관리해야 한다(MUST). 카메라 촬영을 추가하면 안 된다(MUST NOT).

#### Scenario: 남은 슬롯만 선택

- **WHEN** Composer에 0개에서 3개의 이미지가 있고 사용자가 갤러리를 연다
- **THEN** 앱은 남은 슬롯을 넘지 않게 선택 결과를 제한한다
- **AND** 선택 결과 순서대로 Composer 항목을 추가한다

#### Scenario: 항목별 상태 표시

- **WHEN** 선택된 이미지가 upload 중, Ready 또는 실패 상태다
- **THEN** 앱은 local URI preview와 해당 상태를 표시한다
- **AND** 실패 항목에는 공통 원인별 오류 문구, 재시도와 제거 action을 제공한다
- **AND** Ready 항목에는 nullable Alt Text 입력과 제거 action을 제공한다
- **AND** 상태, action과 오류는 색상만이 아니라 accessible name/state로도 구분된다
- **AND** 새 실패를 해당 항목의 alert로 전달하되 단순 rerender마다 중복 announcement하지 않는다

#### Scenario: 플랫폼 입력 접근성

- **WHEN** 사용자가 Web keyboard, pointer 또는 Android/iOS touch와 보조 기술로 Composer를 조작한다
- **THEN** 이미지 추가·재시도·제거와 Sensitive Media control을 같은 제품 결과로 실행할 수 있다
- **AND** 재시도 accessible name은 선택 순서로 실패 대상을 구분한다
- **AND** Web, iOS와 Android interactive target은 canonical platform 기준을 따른다
