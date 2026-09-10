## MODIFIED Requirements

### Requirement: 공통 이미지 업로드 크기와 형식 정규화

**Authority / Provenance:** `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, PROD-881, [PROD-935](https://linear.app/byulmaru/issue/PROD-935/webp-미지원-브라우저에서-이미지-업로드-png-fallback을-지원한다) — 유니버설 앱의 공통 이미지 업로드 경계는 성공적으로 변환할 수 있는 선택 이미지를 가로세로 비율을 유지한 긴 변 최대 `2048px`로 정규화하고, WebP encoding을 지원하는 환경에서는 품질 `0.8`의 WebP로 정규화해야 한다(MUST). 브라우저가 요청한 WebP encoding을 지원하지 않아 변환 결과가 PNG인 경우에는 같은 크기 정규화를 유지한 PNG byte를 허용하고 `image/png`로 직접 전송해야 한다(MUST). 기준 이하 이미지를 확대하거나 원본 byte와 원본 Content-Type을 대신 전송해서는 안 된다(MUST NOT).

#### Scenario: 기준을 초과한 이미지 축소

- **WHEN** 가로나 세로 중 긴 변이 `2048px`를 초과하는 변환 가능한 이미지를 업로드한다
- **THEN** 앱은 원본 비율을 유지하며 긴 변이 `2048px`가 되도록 축소한다
- **AND** 짧은 변은 같은 비율로 계산한다

#### Scenario: 기준 이하 이미지는 확대하지 않음

- **WHEN** 가로와 세로가 모두 `2048px` 이하인 변환 가능한 이미지를 업로드한다
- **THEN** 앱은 원본 가로와 세로를 유지한다
- **AND** 기준에 맞추기 위해 이미지를 확대하지 않는다

#### Scenario: WebP 지원 환경에서 upload 표현 사용

- **WHEN** 공통 경계가 이미지 변환을 완료하고 브라우저가 WebP encoding을 지원한다
- **THEN** 앱은 결과를 품질 `0.8`의 WebP로 인코딩한다
- **AND** signed PUT body에는 변환 결과 byte를 사용한다
- **AND** signed PUT Content-Type에는 `image/webp`를 사용한다

#### Scenario: WebP encoding 미지원 환경에서 PNG fallback

- **WHEN** 공통 경계가 WebP encoding을 요청했지만 브라우저가 지원하지 않아 변환 결과 MIME이 `image/png`로 반환된다
- **THEN** 앱은 원본 비율과 no-upscale을 유지한 정규화 결과를 PNG byte로 사용한다
- **AND** signed PUT body에는 그 PNG byte를 사용한다
- **AND** signed PUT Content-Type에는 `image/png`를 사용한다
- **AND** WebP encoding 미지원 조건이 아닌 일반 변환·read·PUT·complete 실패에는 PNG fallback을 적용하지 않는다

#### Scenario: 공통 입력 경로 정규화

- **WHEN** Post Composer가 picker 또는 Web clipboard에서 이미지를 받고 업로드하거나 Profile 편집이 avatar/header 이미지를 업로드한다
- **THEN** 앱은 입력 경로와 consumer에 관계없이 같은 공통 크기·형식 정규화 경계를 사용한다
- **AND** consumer별 크기 또는 형식 변환 경계를 만들지 않는다
