## ADDED Requirements

### Requirement: 공통 이미지 업로드 크기와 형식 정규화

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, PROD-881 — 유니버설 앱의 공통 이미지 업로드 경계는 성공적으로 변환할 수 있는 선택 이미지를 가로세로 비율을 유지한 긴 변 최대 `2048px`와 품질 `0.8`의 WebP로 정규화한 뒤 그 결과 byte를 Media Storage Service에 직접 전송해야 한다(MUST). 기준 이하 이미지를 확대하거나 원본 byte와 원본 Content-Type을 대신 전송해서는 안 된다(MUST NOT).

#### Scenario: 기준을 초과한 이미지 축소

- **WHEN** 가로나 세로 중 긴 변이 `2048px`를 초과하는 변환 가능한 이미지를 업로드한다
- **THEN** 앱은 원본 비율을 유지하며 긴 변이 `2048px`가 되도록 축소한다
- **AND** 짧은 변은 같은 비율로 계산한다

#### Scenario: 기준 이하 이미지는 확대하지 않음

- **WHEN** 가로와 세로가 모두 `2048px` 이하인 변환 가능한 이미지를 업로드한다
- **THEN** 앱은 원본 가로와 세로를 유지한다
- **AND** 기준에 맞추기 위해 이미지를 확대하지 않는다

#### Scenario: WebP upload 표현 사용

- **WHEN** 공통 경계가 이미지 변환을 완료한다
- **THEN** 앱은 결과를 품질 `0.8`의 WebP로 인코딩한다
- **AND** signed PUT body에는 변환 결과 byte를 사용한다
- **AND** signed PUT Content-Type에는 `image/webp`를 사용한다

#### Scenario: 공통 입력 경로 정규화

- **WHEN** Post Composer가 picker 또는 Web clipboard에서 이미지를 받고 업로드하거나 Profile 편집이 avatar/header 이미지를 업로드한다
- **THEN** 앱은 입력 경로와 consumer에 관계없이 같은 공통 크기·WebP 정규화 경계를 사용한다
- **AND** consumer별 크기 또는 형식 변환 경계를 만들지 않는다
