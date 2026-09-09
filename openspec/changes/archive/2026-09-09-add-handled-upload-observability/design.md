## Context

현재 Sentry 초기화와 React 오류 경계는 Web과 Native의 플랫폼별 module에 이미 존재하며, `captureReactError`는 React `ErrorInfo`를 포함한 기존 처리되지 않은 오류 경계를 담당한다. 공통 `uploadImage` 실행 경계는 issue·transfer·complete 단계의 실패를 `ImageUploadError`로 분류한 뒤 Composer와 Profile 호출부로 다시 전달한다. 호출부는 이 오류를 UI 상태로 처리하므로 처리된 업로드 실패가 기존 전역 오류 경계에 도달하지 않는다.

이번 변경은 원인 수정이 아니라 이 공백을 관측하는 것이다. 기존 Sentry 정책의 runtime metadata gate, local·test 비전송, SDK 진단 보존과 개인정보 경계를 유지해야 한다. 플랫폼 SDK를 함께 import하는 공유 module, 전역 sanitizer와 caller별 중복 capture는 현재 구조와 맞지 않는다.

## Goals / Non-Goals

**Goals:**

- Web·Native 코드가 `Error`와 선택적인 primitive context를 한 번의 호출로 현재 플랫폼 Sentry SDK에 전달할 수 있는 얇은 facade를 제공한다.
- 공통 이미지 업로드 경계에서 처리된 실패를 한 번만 수집하고 기존 `stage`·`reason` 분류를 안전한 context로 전달한다.
- 기존 Error의 SDK 진단 정보, 업로드 오류 결과, UI 상태, 실패 보존과 재시도를 유지한다.
- 관측 실패를 원래 업로드 결과와 격리하고 실행 가능한 단위·component 검증을 남긴다.

**Non-Goals:**

- 실제 업로드 장애 원인, Media Worker request ID·구조화 로그, HTTP API 또는 Media persistence를 변경하지 않는다.
- `captureReactError`의 React `ErrorInfo` 계약, Sentry SDK 교체, source map·debug symbol release 절차를 변경하지 않는다.
- 다른 기능의 catch를 일괄 전환하거나 registry/provider/setter/factory와 같은 확장 계층을 도입하지 않는다.
- 이미지 원본·byte·File/Blob·URL·response body·request payload·사용자 콘텐츠를 정제하기 위한 전역 framework를 만들지 않는다.

## Implementation Guidance

### Current Constraints

- `apps/app/src/observability/sentry-browser.ts`와 `sentry-native.ts`는 각 플랫폼 SDK를 초기화하고 `captureReactError`를 노출한다. 두 SDK를 하나의 module에서 함께 참조하지 않고, 현재 platform resolution 경계를 재사용해야 한다.
- `apps/app/src/components/media/imageUpload.ts`의 `uploadImage`가 issue, 정규화·PUT transfer, complete를 모두 소유하는 공통 실행 경계다. Post Composer와 Profile 호출부는 이 함수의 오류를 UI 상태로만 처리하므로 caller capture는 중복과 잘못된 단계 분류를 만들 수 있다.
- `ImageUploadError`는 고정된 오류 이름과 안전한 `stage`·`reason`을 가진다. `asImageUploadError`는 임의의 원문 오류를 transient 분류로 바꾸므로 업로드 경계에서 raw `Error`, asset, Blob, signed URL 또는 response를 Sentry context로 넘기지 않아야 한다.
- 기존 operations 정책은 SDK가 만든 exception·message·stack과 context를 `beforeSend`에서 재작성하지 않고 전달한다. 따라서 일반 facade가 모든 Error를 일괄 삭제하거나 sanitizer로 재구성하면 기존 PROD-493 계약과 충돌한다. 안전한 context를 만드는 책임은 호출 경계에 있다.
- React 오류는 `ErrorInfo`와 함께 별도 경계를 사용한다. 일반 처리된 오류 facade를 React reporter로 합치면 component stack 전달과 중복 capture 정책이 바뀔 수 있다.

### Recommended Approach

1. 각 플랫폼 Sentry adapter에 `Error`와 선택적 primitive context를 받는 일반 처리된 오류 capture entry point를 추가한다. 이 entry point는 현재 SDK의 `captureException`과 scope/context 전달 방식을 얇게 감싸고, 기존 활성화 gate와 SDK event 전달 정책을 그대로 사용한다. 입력 Error의 SDK 진단 정보를 재작성하지 않으며, React `ErrorInfo`는 계속 기존 `captureReactError`로 보낸다.
2. 공통 업로드 실행 경계의 하나의 upload-level error boundary에서 최종 `ImageUploadError`를 만든 뒤 일반 facade를 한 번 호출한다. 기존 issue·transfer·complete 분류와 `null` early return을 유지하고, Composer·Profile 호출부에는 capture를 추가하지 않는다.
3. 업로드 경계는 고정된 `ImageUploadError.failure`의 기존 `stage`·`reason`과 오류에 부착된 승인된 operation·숫자 status·allowlist code 관측값에서 안전한 진단 context를 구성한다. 일반 facade는 입력을 upload-specific하게 해석하거나 전역으로 정제하지 않는다. capture 호출이 동기적으로 실패하거나 전송되지 않더라도 원래 오류를 다시 전달하고 UI·재시도·성공 결과를 유지한다.
4. 실행 테스트는 활성화된 Web·Native facade 전달, 비활성화된 local·test 비전송, 업로드 실패 1회와 stage/reason 보존, 성공·no-op 무보고, capture 실패 격리와 민감 입력 미포함을 행동으로 검증한다. 실제 운영 Sentry event·symbolication 증거는 이 로컬 구현 검증과 별도다.

### Allowed Alternatives

- 기존 phase별 catch 구조를 유지하면서 upload-level 경계에서 한 번만 보고해도 된다. 단, 각 phase나 caller가 개별적으로 capture하여 중복 event를 만들거나 최종 stage를 덮어써서는 안 된다.
- 플랫폼 adapter가 SDK scope/context API를 사용하는 방식은 허용하지만, 동일한 Error와 안전한 context가 한 번 전달되고 기존 SDK event 보존 계약을 만족해야 한다.
- 현재 platform-specific module resolution을 통해 Web·Native facade를 노출하는 다른 파일 배치는 허용한다. 두 SDK를 공통 module에 묶거나 provider/registry/DI 계층으로 확장하는 것은 이 변경의 대안이 아니다.

### Known Traps

- Composer와 Profile의 각 `catch`에 capture를 추가하면 하나의 업로드 실패가 두 번 보고되거나 UI 호출부가 단계의 owner가 된다.
- `createNormalizedImageBlob` 내부, issue/PUT URL, complete response와 같은 하위 단계마다 reporter callback을 넣으면 최종 실패 하나가 여러 event로 쪼개지고 raw 입력이 leak될 수 있다.
- 공통 facade에서 모든 원문 Error·stack을 금지하거나 `beforeSend` sanitizer로 다시 만들면 기존 SDK 진단 보존 계약을 약화시킨다. 반대로 upload boundary가 raw unknown error, File/Blob, URI, URL, token, response body를 그대로 넘겨서도 안 된다.
- `captureReactError`와 일반 처리된 오류 capture를 합치면 React component stack, mechanism 또는 기존 중복 방지 경계가 달라질 수 있다.
- 비활성 항목의 `null` 반환, 명시적 no-op와 Sentry SDK 호출 실패를 업로드 실패 자체로 오인하지 않아야 한다.
- 현재 `transfer` 단계는 정규화·normalized Blob read와 signed PUT을 함께 포함한다. 처리된 오류 context는 `issue`·`normalize`·`read`·`put`·`complete` operation으로 이 경계를 구분하고, 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답이 있는 경우에만 숫자 status와 승인된 machine code를 보존한다.

## Risks / Trade-offs

- [일반 facade의 재사용 범위가 넓어짐] → facade는 Error/context를 SDK에 전달하는 얇은 경계로 유지하고, 안전한 context 작성 책임과 적용 caller를 문서·review로 제한한다.
- [현재 업로드 분류가 실제 원인 분석에 충분하지 않을 수 있음] → operation으로 transfer 내부 경계를 구분하고, 숫자 status와 승인된 code만 추가한다. 원본 response·message·payload는 계속 제외하므로 실제 원인 해결이나 운영 event 수신을 주장하지 않는다.
- [Sentry capture 실패가 사용자 동작에 영향을 줄 수 있음] → capture 예외·전송 실패를 원래 업로드 오류와 분리하고 결과·UI·재시도 regression test를 둔다.
- [Web·Native adapter 동작이 어긋날 수 있음] → 두 플랫폼의 기존 metadata gate·privacy 설정을 재사용하고 각 adapter의 unit test를 유지한다.

## Migration Plan

별도 데이터·API migration은 없다. canonical Sentry 정책과 이미지 업로드 오류 문서를 먼저 반영한 뒤 adapter와 공통 업로드 경계에 연결하고, package test와 strict OpenSpec 검증을 통과시킨다. 배포 후 실제 event·release·symbolication 수신 여부는 운영 검증으로 별도 확인한다. Rollback은 처리된 업로드 capture 호출과 adapter export를 되돌리는 것으로 기존 UI·업로드 lifecycle을 유지한다.

## Resolved Scope

- 처리된 업로드 실패 context는 `stage`·`reason`에 더해 `issue`·`normalize`·`read`·`put`·`complete` operation을 포함한다.
- 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답이 있는 실패에는 숫자 status를 포함하고, 승인된 machine code allowlist 값만 포함한다. 원본 response body·request payload·URL·token·message는 포함하지 않는다.
