## Why

Web·Native 이미지 업로드 실패는 호출부가 오류를 UI 상태로 처리하면서 현재 Sentry의 처리되지 않은 오류 경계에 도달하지 않는다. 실제 장애 원인은 아직 확정되지 않았으므로, 공통 업로드 경계에서 안전한 진단을 한 번 남겨 다음 원인 분석이 가능하도록 한다.

## What Changes

- Web·Native 앱 코드가 `Error`와 선택적인 primitive context를 한 번의 호출로 기존 플랫폼 Sentry SDK에 전달할 수 있는 얇은 공통 capture 진입점을 제공한다.
- Post Composer와 Local Profile이 공유하는 이미지 업로드 경계에서 처리된 실패를 한 번만 수집하고, 기존 오류 분류의 안전한 `stage`·`reason`과 `issue`·`normalize`·`read`·`put`·`complete` operation, 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답의 숫자 HTTP status, allowlist machine code를 진단 context로 전달한다.
- 기존 Sentry runtime metadata gate, SDK event 전달·개인정보 정책, 오류 UI·재시도·성공 결과를 유지한다.
- PR #810의 사용자 정정에 따라 실제 Error 객체와 message·stack·cause를 직접 또는 표준 cause chain으로 보존한다. 원본 연결 없는 수집 전용 placeholder를 제거하고 기존 UI 분류 wrapper는 유지한다.
- 이미지 byte, File/Blob, signed upload URL, 인증 토큰, response body·request payload와 사용자 콘텐츠를 새 관측 context에 넣지 않는다.
- 실제 업로드 원인 수정, Media Worker request ID·구조화 로그, SDK 교체, 다른 기능의 catch 일괄 전환과 운영 배포는 이 변경에서 다루지 않는다.

## Authority / Provenance

- Canonical: `docs/operations/sentry.md`, `docs/design/media-upload-errors.md`
- Linear Contract: `PROD-929`
- Linear Implementations: `PROD-929` (계약과 구현을 동일 이슈가 소유)

## Compatibility / Reference

- `openspec/specs/native-error-observability/spec.md`: 기존 처리되지 않은 React·Native 오류 관측 계약을 확인하기 위한 호환성 참고이며, 이번 처리된 오류 범위의 권위가 아니다.
- `openspec/specs/post-composer-media-upload/spec.md`: 기존 공통 업로드 lifecycle과 오류 분류를 확인하기 위한 호환성 참고이며, 이번 Sentry 관측 범위의 권위가 아니다.

## Capabilities

### New Capabilities

- `handled-client-error-observability`: Web·Native 앱의 명시적 처리된 오류 capture와 공통 이미지 업로드 경계의 단일 실패 관측

### Modified Capabilities

- 없음.

## Impact

- `apps/app`의 Web·Native Sentry adapter와 공통 이미지 업로드 실행 경계에 영향을 준다.
- Post Composer와 Profile 편집의 호출부는 기존 오류 상태·재시도 결과를 유지하며 별도 capture를 추가하지 않는다.
- Sentry event에는 기존 runtime·release metadata와 SDK 진단을 재사용하고, 추가 운영 인프라·API·Media persistence·dependency 변경은 없다.
