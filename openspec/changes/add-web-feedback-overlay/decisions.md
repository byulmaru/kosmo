## Context

이 기록은 `docs/design/feedback.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`와 PROD-594의 Web 피드백 overlay 계약을 구현 가능한 경계로 정리한다. 제품 동작은 canonical 문서와 Linear를 따르고, 내부 조립 위치와 form/presentation 경계만 구현 선택으로 기록한다.

## Decision Records

### Web 일반 진입은 query-backed overlay를 사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `PROD-594`
- Status: Active
- Context / Problem: `/feedback` route 이동은 사용자가 보던 route, scroll과 focus 맥락을 교체한다.
- Decision Outcome: Web shell의 일반 진입은 현재 URL에 `feedback=open`을 push하고 현재 route 위 overlay를 연다. 직접 `/feedback` 접근은 독립 page fallback으로 유지한다.
- Alternatives Considered: `/feedback`로만 이동하면 현재 맥락 보존 요구를 충족하지 못한다. 별도 overlay pathname은 canonical direct fallback과 두 presentation을 구분하기 어렵다.
- Consequences: overlay open 상태를 URL에서 복원할 수 있고 browser back/forward가 동작한다. query-only 이동은 primary route scroll reset으로 취급하지 않는다.
- Confirmation / Follow-up: open·back·forward·fresh-load close와 기존 query 보존을 Web runtime에서 확인한다.

### 성공 후 overlay를 유지해 연속 제출을 허용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `PROD-594`
- Status: Active
- Context / Problem: 제출 성공 후 자동 close하면 여러 피드백을 이어서 보내기 어렵고 원래 화면 복귀 시점도 form이 결정하게 된다.
- Decision Outcome: 성공 시 기존 form 초기화와 성공 문구를 유지하되 overlay는 명시적 close 전까지 열린 상태로 둔다. 실패 시 기존 draft와 retry를 유지한다.
- Alternatives Considered: 성공 직후 자동 close는 연속 제출 요구와 presentation-owned close 경계를 위반한다.
- Consequences: 성공 상태는 dirty가 아니며 사용자는 같은 overlay에서 다음 피드백을 작성하거나 명시적으로 닫을 수 있다.
- Confirmation / Follow-up: success reset 후 query와 overlay 유지, failure 후 draft 유지와 retry를 검증한다.

### close 정책은 dirty와 submitting 상태를 구분한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `docs/design/accessibility.md`, `PROD-594`
- Status: Active
- Context / Problem: close button, backdrop, `Escape`, browser back이 서로 다른 상태 손실 결과를 만들 수 있다.
- Decision Outcome: 모든 close source를 overlay의 `requestClose`로 통합한다. submitting 중에는 close를 차단하고, dirty draft는 폐기 확인 후에만 닫으며, clean 상태는 source에 맞는 back 또는 query-only replace를 수행한다.
- Alternatives Considered: close source별 handler는 정책 불일치와 draft 손실 위험을 만든다. form 내부 confirmation은 page/popup presentation 중립성을 깨뜨린다.
- Consequences: browser traversal도 form 상태와 동기화해야 하며 취소 후 URL, overlay와 draft가 함께 유지되어야 한다.
- Confirmation / Follow-up: 네 close source를 clean·dirty·submitting 상태에서 직접 검증한다.

### responsive surface는 기존 compact breakpoint를 재사용한다

- Decision Date: 2026-08-03
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/feedback.md`, `docs/design/breakpoints.md`, `PROD-594`
- Status: Active
- Context / Problem: 작은 Web viewport와 desktop Web은 같은 form을 사용하지만 적합한 modal geometry가 다르다.
- Decision Outcome: `<768px` Web은 bottom sheet, `>=768px` Web은 최대 약 `600px` 너비와 `85dvh` 높이의 중앙 dialog를 사용하고 form body만 내부 scroll한다.
- Alternatives Considered: 기존 `ModalSheet`의 고정 centered `420px` surface는 승인된 breakpoint와 크기를 충족하지 않는다. 새 breakpoint는 canonical token을 중복한다.
- Consequences: `breakpoints.compact`를 presentation 분기에 재사용하며 Android/iOS surface는 바꾸지 않는다.
- Confirmation / Follow-up: 390px·900px·1400px에서 geometry, reflow와 내부 scroll을 관찰한다.

### overlay는 UniversalShell의 route tree와 나란한 단일 인스턴스다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/feedback.md`, `docs/design/breakpoints.md`, `PROD-594`
- Status: Active
- Context / Problem: desktop sidebar와 mobile drawer가 `SidebarNavigation`을 각각 렌더링하고 중앙 `<Slot />`은 route lifecycle을 소유한다.
- Decision Outcome: Web overlay를 `UniversalShellContent`의 shell root `<View>` 다음, `ShellChromeProvider` 내부에 한 번 조립한다. Overlay는 `<Slot />`의 자식이나 각 navigation 인스턴스의 자식이 아니다.
- Alternatives Considered: navigation 내부 조립은 overlay를 중복하고, `<Slot />` 내부 조립은 rail·mobile chrome 차단과 route 보존을 어렵게 한다. 범용 modal primitive 확장은 다른 소비자의 회귀 범위를 넓힌다.
- Consequences: full/compact/mobile 진입점이 같은 lifecycle owner를 사용하고 배경 route tree가 유지된다. Shell root에 background inert, scroll lock과 focus restore 경계가 필요하다.
- Confirmation / Follow-up: overlay 단일 인스턴스, 모든 shell surface 차단, close 후 기존 route·scroll·focus 복원을 검증한다.

### Form은 presentation 상태만 보고한다

- Decision Date: 2026-08-03
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/feedback.md`, `PROD-594`
- Status: Active
- Context / Problem: overlay가 안전한 close를 결정하려면 draft와 mutation 상태가 필요하지만 form이 navigation을 소유해서는 안 된다.
- Decision Outcome: `FeedbackForm`은 `{ dirty, submitting }`만 callback으로 보고한다. Form은 query, overlay, confirmation, close source와 browser history를 알지 않는다.
- Alternatives Considered: imperative close API나 popup variant는 page/popup 경계를 결합한다. 상태를 overlay에 복제하면 중복 form state가 생긴다.
- Consequences: 기존 page consumer는 callback 없이 동작하고 overlay만 상태 신호를 사용한다.
- Confirmation / Follow-up: 초기·draft·pending·success·failure 상태 전이를 observable callback 결과로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
