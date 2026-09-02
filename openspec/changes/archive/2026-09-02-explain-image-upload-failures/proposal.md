## Why

Post Composer와 Local Profile 편집은 signed PUT 실패의 HTTP status와 machine-readable code를 버리고 모든
원인을 같은 업로드 실패로 안내한다. 사용자가 다른 이미지를 선택해야 하는 실패와 잠시 후 재시도할 수 있는
실패를 구분하면서도 Storage Service의 원문 message나 내부 정보를 노출하지 않는 공통 계약이 필요하다.

## What Changes

- signed PUT의 non-2xx 응답에서 허용된 status/code 조합만 공통 사용자-facing 원인으로 분류한다.
- 업로드 URL 발급, byte 전송, 완료 확인 단계를 구분하고 알 수 없는 응답·네트워크·일시적 서버 오류를 안전한
  transient 실패로 폴백한다.
- Post Composer와 Profile 편집이 같은 한국어 문구, 실패 보존과 항목별 재시도 정책을 사용한다.
- 오류 alert와 재시도 accessible name이 실패 대상·단계·복구 행동과 일치하도록 한다.
- 정상 업로드, 알려진 모든 code, malformed/unknown 응답, 네트워크·서버 오류와 두 consumer의 회귀 테스트를
  추가한다.
- Media Storage Service, Kosmo GraphQL schema·persistence, 자동 retry·관측성·HEIC·orphan 정리는 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/media.md`, `docs/domain/decisions/0013-media-storage-service-boundary.md`,
  `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `docs/design/media-upload-errors.md`,
  `docs/design/profile-edit.md`, `docs/design/accessibility.md`
- Linear Contract: `PROD-657`
- Linear Implementations: `PROD-657` — 현재 client 구현·검증 slice를 같은 이슈가 소유한다.

## Capabilities

### New Capabilities

- `image-upload-error-feedback`: 업로드 단계와 signed PUT status/code를 안전한 사용자-facing 원인·한국어 문구·재시도
  의미로 변환하고 Post Composer와 Profile 편집이 함께 소비하는 공통 계약

### Modified Capabilities

- `post-composer-media-upload`: 실패 항목 보존·재시도 계약에 공통 원인별 안내와 접근성 상태를 추가한다.

## Impact

- App client의 공통 upload helper/error type과 Post Composer·Profile 편집 연결부가 영향을 받는다.
- 관련 app unit/component/Storybook 테스트와 Web runtime 검증 범위가 영향을 받는다.
- Media Storage Service의 기존 `{ error: { code, message } }` 응답과 HTTP status를 읽지만 서비스 구현은 변경하지
  않으며 `message`는 사용자 문구에 사용하지 않는다.
- GraphQL schema, API resolver, 데이터베이스 migration과 workspace dependency 변경은 없다.
