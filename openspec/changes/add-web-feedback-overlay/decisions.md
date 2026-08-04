## Context

이 기록은 canonical feedback 문서와 PROD-594의 Web overlay 계약을 구현 경계로 정리한다. 제품 동작은
canonical 문서와 Linear를 따르고 내부 조립 위치와 form/presentation 경계만 구현 선택으로 기록한다.

## Decision Records

### Web 일반 진입은 shell-owned transient state를 사용한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `PROD-594`
- Status: Active
- Context / Problem: `/feedback` route는 현재 화면을 교체하지만 query/history 기반 overlay는 transient UI에 비해
  open/close, fresh-load와 dirty guard를 과도하게 결합했다.
- Decision Outcome: 인증된 Web shell의 일반 진입은 button callback으로 `UniversalShell` 로컬 상태를 열고 닫는다.
  URL과 browser history는 바꾸지 않으며 direct `/feedback`은 page fallback으로 유지한다.
- Alternatives Considered: query-backed overlay는 reload 복원과 Back/Forward를 제공하지만 history guard와 router
  mock을 요구한다. `/feedback` route 전용 진입은 현재 맥락 유지 요구를 충족하지 못한다.
- Consequences: 구현과 테스트 계약이 단순해지며 reload와 browser navigation에서 overlay/draft를 복원하거나
  보호하지 않는다.
- Confirmation / Follow-up: shell button open/close 중 URL 불변, direct query 무시와 `/feedback` fallback을 E2E로
  확인한다.

### 성공 후 overlay를 유지해 연속 제출을 허용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `PROD-594`
- Status: Active
- Decision Outcome: 성공 시 기존 form 초기화와 성공 문구를 유지하되 overlay는 명시적 close 전까지 연다.
  실패 시 기존 draft와 retry를 유지한다.
- Consequences: 사용자는 같은 overlay에서 다음 피드백을 작성하거나 명시적으로 닫을 수 있다.

### 명시적 close 정책은 dirty와 submitting 상태를 구분한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `docs/design/accessibility.md`, `PROD-594`
- Status: Active
- Decision Outcome: 닫기 버튼, backdrop과 `Escape`를 overlay의 `requestClose`로 통합한다. Submitting 중에는
  닫기를 차단하고 dirty draft는 폐기 확인 후에만 닫으며 clean 상태는 즉시 닫는다.
- Alternatives Considered: close source별 handler는 정책 불일치와 draft 손실 위험을 만든다. Browser navigation
  guard는 transient shell state의 승인 범위를 넘는다.
- Consequences: browser Back/Forward, reload, 주소 이동과 tab close는 이 정책의 보호 대상이 아니다.
- Confirmation / Follow-up: 세 close source를 clean·dirty·submitting 상태에서 직접 검증한다.

### responsive surface는 기존 compact breakpoint를 재사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `docs/design/breakpoints.md`, `PROD-594`
- Status: Active
- Decision Outcome: `<768px` Web은 bottom sheet, `>=768px` Web은 최대 약 `600px` 너비와 `85dvh` 높이의 중앙
  dialog를 사용하고 form body만 내부 scroll한다.
- Consequences: `breakpoints.compact`를 재사용하며 Android/iOS surface는 바꾸지 않는다.

### overlay는 UniversalShell의 route tree와 나란한 단일 인스턴스다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/feedback.md`, `docs/design/breakpoints.md`, `PROD-594`
- Status: Active
- Decision Outcome: Web overlay를 shell root `<View>` 다음, `ShellChromeProvider` 내부에 한 번 조립한다.
  `<Slot />`이나 각 navigation 인스턴스의 자식으로 두지 않는다.
- Consequences: 모든 breakpoint가 같은 lifecycle owner를 사용하고 배경 route tree가 유지된다.

### Form은 presentation 상태만 보고한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/feedback.md`, `PROD-594`
- Status: Active
- Decision Outcome: `FeedbackForm`은 `{dirty, submitting}`만 callback으로 보고하며 overlay, confirmation,
  navigation과 URL을 알지 않는다.
- Consequences: 기존 page consumer는 callback 없이 동작하고 overlay만 상태 신호를 사용한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### Web 일반 진입은 query-backed overlay를 사용한다

- Decision Date: 2026-08-03
- Superseded Date: 2026-08-05
- Previous Outcome: 현재 URL에 `feedback=open`을 push해 overlay를 열고 Back/Forward와 reload 복원을 제공한다.
- Superseded By: `Web 일반 진입은 shell-owned transient state를 사용한다`.

### fresh-load browser back은 단일 same-document barrier로 처리한다

- Decision Date: 2026-08-04
- Superseded Date: 2026-08-05
- Previous Outcome: query 없는 same-document barrier와 `popstate` guard로 fresh-load Back의 dirty/submitting
  정책을 처리한다.
- Superseded By: URL/history가 overlay 계약에서 제거되어 barrier와 history guard도 제거한다.
