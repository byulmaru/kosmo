> **2026-09-10 문서 정정:** 실제 Safari Web 앱 빌드에서 PNG fallback → `image/png` signed PUT → `complete` 성공을 확인하는 것은 선택적 evidence가 아니라 완료 조건이다. 이는 2026-09-09 승인된 PNG fallback 제품 정책이나 범위를 변경하지 않는다.

## Why

Safari와 같이 WebP canvas encoding을 지원하지 않는 브라우저에서는 공통 이미지 정규화가 `image/png` 결과를 돌려받은 뒤 실패하고 signed PUT 전에 업로드가 중단된다. WebP를 생성할 수 있는 환경의 기존 계약은 유지하면서, 인코딩 미지원 환경에서도 이미지 크기 축소와 업로드 완료를 보장한다.

## What Changes

- 공통 이미지 업로드 경계에서 요청한 WebP의 실제 인코딩 결과가 브라우저 미지원으로 PNG가 된 경우에만 PNG 결과를 허용한다.
- fallback 결과의 byte와 signed PUT `Content-Type`을 `image/png`로 함께 맞춘다.
- WebP 지원 환경의 품질 `0.8` WebP, 긴 변 최대 `2048px`, 비율 유지와 no-upscale 계약을 유지한다.
- Post Composer picker/clipboard와 Profile avatar/header가 같은 fallback 경계를 사용하도록 정밀화한다.
- 일반 변환·read·PUT·complete 실패, HEIC/HEIF decoder, Native Blob 문제와 서버 계약은 변경하지 않는다.
- 실제 Safari Web 앱 빌드에서 fallback → PNG byte → `image/png` signed PUT → `complete` 성공을 실행 검증하고 결과를 기록한다. WebKit smoke는 보조 evidence로 기록한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/design/media-upload-errors.md`
- Linear Contract: [PROD-935](https://linear.app/byulmaru/issue/PROD-935/webp-미지원-브라우저에서-이미지-업로드-png-fallback을-지원한다)
- Linear Implementations: 없음.
- Existing capability baseline: `openspec/specs/image-upload-normalization/spec.md`, `openspec/specs/post-composer-media-upload/spec.md`, `openspec/specs/profile-edit-ui/spec.md`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `image-upload-normalization`: WebP encoding 미지원 시 PNG fallback을 허용하되 크기 정규화와 결과 MIME 일치를 유지한다.
- `post-composer-media-upload`: picker와 clipboard의 공통 업로드가 PNG fallback 결과를 동일하게 직접 전송하고 완료한다.
- `profile-edit-ui`: avatar/header 공통 업로드가 PNG fallback 결과를 동일하게 직접 전송하고 stale/retry 경계를 유지한다.

## Impact

- `apps/app/src/components/media/imageUpload.ts`의 공통 변환·byte·signed PUT 경계와 관련 실행 테스트
- Post Composer 및 Profile 편집의 기존 공통 업로드 호출 경로
- WebKit/Safari 유사 환경의 보조 smoke와 실제 Safari Web 앱 빌드 fallback → PNG signed PUT → `complete` 실행 검증, 기존 WebP 지원 환경 회귀 검증
- GraphQL, persistence, Media Storage Service API, dependency에는 변경 없음
