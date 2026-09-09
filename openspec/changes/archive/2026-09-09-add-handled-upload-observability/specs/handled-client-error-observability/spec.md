## Compatibility / Reference

- `openspec/specs/native-error-observability/spec.md`: 기존 처리되지 않은 React·Native 오류 관측 계약과의 호환성을 확인한다. 이번 처리된 오류 요구사항의 권위는 아니다.
- `openspec/specs/post-composer-media-upload/spec.md`: 기존 공통 이미지 업로드 lifecycle과 오류 분류와의 호환성을 확인한다. 이번 Sentry 관측 요구사항의 권위는 아니다.

## ADDED Requirements

### Requirement: Web·Native 처리된 오류를 공통 Sentry 경계로 전달한다

**Authority / Provenance:** `docs/operations/sentry.md`, PROD-493, PROD-483, PROD-929. Web·Native 앱은 승인된 처리된 오류를 공통 Sentry 진입점 한 번으로 현재 플랫폼 SDK에 전달할 수 있어야 한다(MUST). 공통 진입점은 기존 DSN·environment·release metadata gate와 local·test 외부 전송 차단을 재사용해야 하며(MUST), SDK가 만든 오류의 exception·message·stack 등 진단 정보와 호출 경계가 제공한 안전한 context를 전역 정제 규칙으로 삭제하거나 재작성해서는 안 된다(MUST NOT). 호출 경계는 인증 정보, 불필요한 사용자 콘텐츠와 개인정보를 오류 payload 또는 context에 추가해서는 안 된다(MUST NOT). 기존 처리되지 않은 React 오류 경계의 capture와 component-level 오류 context 전달 행동은 유지되어야 하며(MUST), 공통 처리된 오류 진입점으로 대체해서는 안 된다(MUST NOT).

#### Scenario: 활성화된 Web·Native runtime에서 처리된 오류를 수집한다

- **WHEN** DSN·environment·release metadata가 완전한 runtime에서 호출자가 승인된 처리된 오류와 안전한 context를 공통 진입점으로 전달한다
- **THEN** 현재 플랫폼 Sentry SDK가 해당 Error와 context를 한 번 수집하고 SDK 진단 정보를 보존한다

#### Scenario: local·test runtime은 외부 event를 보내지 않는다

- **WHEN** DSN·environment·release metadata 중 하나라도 없는 local·test runtime에서 호출자가 처리된 오류를 공통 진입점으로 전달한다
- **THEN** 외부 Sentry event를 전송하지 않고 기존 호출 흐름을 유지한다

### Requirement: 공통 이미지 업로드 경계에서 처리된 실패를 한 번 관측한다

**Authority / Provenance:** `docs/operations/sentry.md`, `docs/design/media-upload-errors.md`, PROD-929. Post Composer와 Local Profile이 공유하는 이미지 업로드 경계는 처리된 실패를 공통 Sentry 진입점으로 실패당 한 번 수집해야 한다(MUST). 실패 event에는 기존 이미지 업로드 오류 모델에서 안전하게 구성한 `stage`와 `reason`, `issue`·`normalize`·`read`·`put`·`complete` 중 하나의 `operation`을 전달해야 한다(MUST). 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답이 있는 실패에는 숫자 HTTP `status`를 전달하며, machine-readable `code`는 승인된 allowlist 값만 전달해야 한다(MUST). 호출부가 같은 실패를 다시 수집해서는 안 되며(MUST NOT), 성공·비활성 항목의 `null` 결과·명시적 no-op은 처리된 실패 event를 만들지 않아야 한다(MUST NOT). 관측 수집의 실패는 업로드 결과, 기존 오류 UI, 실패 항목 보존과 재시도 동작을 바꾸어서는 안 된다(MUST NOT). 업로드 경계는 실제 Error를 직접 전달하거나 기존 UI 분류 wrapper의 표준 `cause` chain에 원본 객체를 연결하여 모든 오류 단계의 message·stack·cause와 SDK 진단 정보를 보존해야 한다(MUST). 원본 연결 없이 수집만을 위한 일반 메시지의 새 Error로 대체하거나 오류를 복제·전역 정제해서는 안 된다(MUST NOT). 업로드 경계는 이미지 byte, File/Blob, signed upload URL, 인증 토큰, raw request/response와 사용자 콘텐츠를 오류나 새 event context에 별도로 첨부해서는 안 된다(MUST NOT). 실제 오류에 인증 정보나 불필요한 개인정보가 포함되는 구체적 경로가 확인되면 해당 데이터가 생성·첨부되는 경계에서 필요한 제한을 정해야 하며(MUST), 원문 message·stack·cause 자체를 일괄 제거해서는 안 된다(MUST NOT).

#### Scenario: 이미지 업로드 실패를 한 번 수집하고 기존 오류 결과를 유지한다

- **WHEN** 공통 이미지 업로드 경계가 issue·transfer·complete 중 하나에서 처리된 실패를 분류한다
- **THEN** 공통 Sentry 경계가 해당 실패의 안전한 stage·reason과 함께 한 번 호출되고 기존 업로드 오류 결과와 UI 복구 흐름이 유지된다

#### Scenario: 원본 오류 진단과 제한된 context를 함께 보존한다

- **WHEN** 이미지 업로드의 내부 정규화·읽기 또는 issue·PUT·complete 경계가 오류를 처리한다
- **THEN** Sentry에 전달되는 Error 자체 또는 표준 cause chain에서 원본 Error의 identity·message·stack·cause가 보존되고 기존 UI 분류가 유지된다
- **AND** 새 context에는 승인된 진단 필드만 포함하며 raw request/response나 asset을 별도로 첨부하지 않는다

#### Scenario: 이미지 SDK가 삽입한 알려진 이미지 URI만 제한한다

- **WHEN** 이미지 처리 SDK의 오류 message·stack 또는 cause chain에 현재 asset/source/normalized 이미지 URI가 포함된다
- **THEN** 이미지 처리 경계가 알고 있는 해당 URI와 정확히 일치하는 부분만 제한하고 원본 오류 객체·type·나머지 메시지·stack frame을 보존한다
- **AND** 일반 URL 패턴이나 다른 기능의 오류에 전역 정제를 적용하지 않는다

#### Scenario: 두 consumer가 같은 공통 업로드 실패를 중복 수집하지 않는다

- **WHEN** Post Composer 또는 Local Profile이 공통 이미지 업로드 경계에서 처리된 실패를 전달받아 UI 상태로 처리한다
- **THEN** consumer는 별도 Sentry capture를 추가하지 않고 공통 경계의 단일 event만 남긴다

#### Scenario: 성공과 no-op은 처리된 실패로 수집하지 않는다

- **WHEN** 이미지 업로드가 성공하거나 비활성 항목·명시적 no-op이 `null` 결과로 종료된다
- **THEN** 처리된 실패 Sentry event를 만들지 않는다

#### Scenario: 관측 실패가 업로드 결과를 바꾸지 않는다

- **WHEN** 처리된 업로드 실패를 수집하는 중 Sentry SDK 호출이 예외를 던지거나 전송하지 못한다
- **THEN** 원래 업로드 오류, 오류 UI, 실패 상태 보존과 재시도 결과는 관측 전과 동일하다
