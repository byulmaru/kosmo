## Why

Post Composer와 Profile 편집은 PR #719로 같은 이미지 업로드 실행 경계를 사용하지만, 선택한 이미지의 원본 해상도와 형식을 그대로 전송한다. 실제 표시보다 큰 이미지의 전송량과 저장량을 줄이고 두 consumer의 업로드 표현을 일관되게 만들기 위해 공통 경계에서 크기와 형식만 정규화한다.

## What Changes

- 변환 가능한 이미지 업로드 입력을 긴 변 최대 `2048px`로 비율 유지 축소한다.
- 기준 이하 이미지는 확대하지 않되 모든 변환 결과를 품질 `0.8`의 WebP로 인코딩한다.
- 변환된 byte와 `image/webp` Content-Type을 signed PUT에 사용한다.
- Post Composer와 Profile avatar/header가 같은 공통 정규화 경계를 사용한다.
- Post Composer의 picker와 Web clipboard 이미지가 같은 공통 정규화 흐름을 사용한다.
- 입력 형식 지원 목록은 별도 제품 계약으로 고정하지 않고 공통 변환 라이브러리가 처리 가능한 입력에 정규화를 적용한다.
- 이미지 선택·preview·오류 분류·재시도·stale result와 서버 저장 정책은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/design/media-upload-errors.md`, `docs/design/profile-edit.md`
- Linear Contract: PROD-881
- Linear Implementations: PROD-688

## Capabilities

### New Capabilities

- `image-upload-normalization`: 공통 앱 업로드 경계가 이미지의 긴 변을 최대 `2048px`로 제한하고 품질 `0.8`의 WebP byte를 생성해 전송하는 계약

### Modified Capabilities

- `post-composer-media-upload`: Composer의 picker와 clipboard 입력이 원본 byte 대신 공통 정규화 결과를 직접 업로드하도록 변경
- `profile-edit-ui`: avatar/header의 field-scoped 업로드가 같은 공통 정규화 결과를 사용하도록 변경

## Impact

- `apps/app`의 공통 `components/media/imageUpload` 경계와 그 단위 테스트
- Post Composer와 Profile 편집의 기존 공통 업로드 호출부와 회귀 테스트
- Web·Android·iOS 이미지 변환을 위한 Expo 호환 이미지 조작 dependency
- GraphQL schema, Kosmo API, Media Storage Service와 persistence 계약에는 변경 없음
