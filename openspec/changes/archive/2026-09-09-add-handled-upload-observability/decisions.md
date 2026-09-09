## Context

이 결정 기록은 `PROD-929`의 처리된 이미지 업로드 실패 관측 범위와
`docs/operations/sentry.md`, `docs/design/media-upload-errors.md`의 현재 정책을
바탕으로 한다. 기존 처리되지 않은 React·Native 오류 관측과 공통 업로드
lifecycle은 호환성을 확인하는 참고이며, 이번 처리된 오류 범위의 권위가 아니다.
추가 진단 필드는 `PROD-929` 사용자 gate에서 operation·numeric HTTP status·allowlisted
machine code를 포함하는 것으로 승인되었으며, 이 기록은 해당 범위를 구현 계약으로
고정한다.

## Decision Records

### 처리된 이미지 업로드 실패는 공통 업로드 경계에서 관측한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/sentry.md`, `docs/design/media-upload-errors.md`, `PROD-929`
- Status: Active
- Context / Problem: Post Composer와 Local Profile은 공통 이미지 업로드 실패를 UI 상태로 처리하므로 기존 처리되지 않은 오류 경계만으로는 실패 원인을 확인할 수 없다.
- Decision Outcome: 공통 이미지 업로드 경계에서 처리된 실패를 실패당 한 번 수집한다. 호출부는 별도 capture를 추가하지 않으며, 성공·비활성 항목·명시적 no-op은 처리된 실패 event를 만들지 않는다.
- Alternatives Considered: 각 consumer의 `catch`에서 수집하는 방식은 중복 event와 잘못된 lifecycle owner를 만들 수 있어 선택하지 않는다. 각 하위 단계에 reporter를 주입하는 방식은 한 실패를 여러 event로 나누므로 선택하지 않는다.
- Consequences: issue·transfer·complete lifecycle과 기존 오류 UI·실패 보존·재시도를 유지하면서 공통 경계에 단일 관측 지점을 둔다.
- Confirmation / Follow-up: 업로드 성공·no-op·각 실패 단계와 두 consumer의 중복 없는 capture를 실행 테스트로 확인한다.

### Web과 Native는 기존 플랫폼 SDK 경계를 재사용하는 얇은 공통 진입점을 사용한다

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/sentry.md`, `PROD-483`, `PROD-493`, `PROD-929`
- Status: Active
- Context / Problem: 처리된 오류를 수집해야 하지만 플랫폼 SDK를 공통 module에 함께 import하거나 기존 React 오류 reporter를 대체하면 현재 platform resolution과 component-level 오류 전달 계약이 달라질 수 있다.
- Decision Outcome: Web과 Native가 각자의 기존 Sentry adapter와 runtime metadata gate를 통해 처리된 오류를 전달하는 얇은 진입점을 제공한다. 기존 처리되지 않은 React capture 경계는 유지한다.
- Alternatives Considered: 두 플랫폼 SDK를 하나의 shared module에 묶는 방식은 platform resolution 경계를 흐리므로 선택하지 않는다. React reporter를 일반 처리된 오류 reporter로 통합하는 방식은 component stack과 기존 오류 경계를 변경하므로 선택하지 않는다.
- Consequences: 두 adapter가 동일한 처리된 오류 전달·비전송 동작을 각각 검증해야 하며, 공통 facade에는 upload-specific 해석이나 확장 계층이 필요하지 않다.
- Confirmation / Follow-up: 활성화된 Web·Native runtime에서 SDK 전달을, metadata가 불완전한 local·test runtime에서 외부 비전송을 행동으로 검증한다.

### 업로드 경계는 안전하게 분류된 오류와 진단 context만 전달한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/sentry.md`, `docs/design/media-upload-errors.md`, `PROD-929`
- Status: Superseded
- Superseded By: 2026-09-09 사용자 정정 — 원본 오류 진단은 표준 cause chain으로 보존한다.
- Context / Problem: Sentry가 처리된 업로드 실패를 수집하더라도 원본 이미지와 전송 정보를 event에 넣으면 개인정보·credential·사용자 콘텐츠가 유출될 수 있다.
- Decision Outcome: 업로드 경계는 기존 오류 모델에서 안전한 `stage`·`reason`을 사용해 분류된 오류와 primitive context를 구성한다. 이미지 byte, File/Blob, signed upload URL, 인증 토큰, response body·request payload, 사용자 콘텐츠와 원본 unknown exception·cause·message는 capture payload 또는 새 context에 전달하지 않는다. 공통 진입점은 모든 오류를 전역 sanitizer로 재작성하지 않는다.
- Alternatives Considered: 원본 exception과 response를 그대로 전달하는 방식은 개인정보·credential 경계를 위반할 수 있어 선택하지 않는다. 공통 facade에서 모든 오류를 전역 정제하는 방식은 기존 SDK 진단 보존 정책을 약화시키므로 선택하지 않는다.
- Consequences: 원인 분석에는 기존 안전한 분류와 승인된 operation·numeric status·allowlisted code가 활용되며, 호출 경계가 그 payload 안전성을 함께 책임진다.
- Confirmation / Follow-up: capture에 전달된 오류와 context에 금지된 입력이 포함되지 않는지 실행 결과로 확인한다.

### 업로드 관측 context는 승인된 operation·status·code만 포함한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/sentry.md`, `docs/design/media-upload-errors.md`, `PROD-929`
- Status: Active
- Context / Problem: 기존 `transfer` 분류는 정규화·normalized Blob read·signed PUT을 하나의 단계로 묶어 원인 분석에 필요한 안전한 구분이 부족했다.
- Decision Outcome: 처리된 업로드 오류 event는 `stage`·`reason`과 `issue`·`normalize`·`read`·`put`·`complete` 중 하나의 `operation`을 포함한다. 공통 업로드 경계에서 직접 확인할 수 있는 normalized-image read/PUT 응답이 있는 경우에만 숫자 status를 포함하고, 승인된 machine code allowlist 값만 포함한다.
- Alternatives Considered: response body·URL·token·request payload를 새 context에 첨부하는 방식은 privacy 경계를 위반하므로 선택하지 않는다. 원본 Error의 진단 정보는 아래 사용자 정정에 따라 보존하며, 모든 오류를 전역 sanitizer로 재작성하지 않는다.
- Consequences: 업로드 경계가 분류 단계의 안전한 primitive context를 소유하며, 일반 facade는 이를 해석하거나 추가 정제하지 않는다.
- Confirmation / Follow-up: 각 operation과 허용 status/code 조합, 미허용 code 제거를 실행 테스트로 확인한다.

### 원본 오류 진단은 표준 cause chain으로 보존한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/sentry.md`, `docs/design/media-upload-errors.md`, `PROD-929`의 PR #810 사용자 정정 승인
- Status: Active
- Supersedes: 업로드 경계는 안전하게 분류된 오류와 진단 context만 전달한다.
- Context / Problem: 이전 원본 exception·message·cause 일괄 금지 결정으로 수집 전용 placeholder와 내부 catch에서 실제 원인과 stack이 사라졌다. 사용자가 실제 오류 진단을 보존하고 실제 민감정보만 제한하도록 명시적으로 정정했다.
- Decision Outcome: 원본 Error 객체를 직접 전달하거나 기존 UI 분류 wrapper의 표준 `cause` chain에 연결해 모든 오류 단계의 message·stack·cause를 보존한다. 기존 UI wrapper는 허용하지만, 원본 연결 없이 수집만을 위한 placeholder로 대체하지 않는다. 새 context에는 승인된 진단 필드만 넣고 raw request/response·asset·credential·사용자 콘텐츠를 별도로 첨부하지 않는다.
- Alternatives Considered: capture 인자만 변경하면 내부 catch에서 이미 버린 원인을 복구할 수 없다. 표준 Error cause를 사용하며 복제·regex sanitizer·새 의존성을 추가하지 않는다.
- Consequences: 기존 UI 분류·단일 capture·runtime gate를 유지하면서 SDK가 원본 오류 chain을 진단할 수 있다. 실제 민감정보가 포함되는 구체적 경로가 확인되면 해당 생성·첨부 경계의 필요한 제한을 정하며, 추정으로 오류 진단 전체를 지우지 않는다.
- Confirmation / Follow-up: 원본 객체 identity·message·stack·cause, 내부 catch와 non-Error cause 보존, 단일 capture와 제한된 context를 실행 테스트로 확인한다.
- Concrete Sensitive Path: Expo Web save 실패는 이미지 ref의 URI(blob 또는 canvas data URI)를 message에 포함하고 Android load 실패도 asset URI를 포함한다. 사용자 승인한 실제 민감정보 제한에 따라 이미지 처리 경계가 보유한 asset/source/normalized URI의 정확한 문자열만 message·stack과 cause chain에서 제한한다. 같은 Error 객체와 나머지 진단은 보존하며 전역 패턴 정제나 복제를 추가하지 않는다.

## Remaining Decisions

- 없음. 실제 운영 Sentry event·release·symbolication 수신 검증은 구현 완료와 별도의 운영 follow-up이다.

## Superseded Decisions

- 위의 `업로드 경계는 안전하게 분류된 오류와 진단 context만 전달한다` 기록은 이전 결정의 이력으로 보존한다. 현재 계약은 사용자 정정 기록을 따른다.
