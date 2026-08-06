## Why

Web 셸의 `/feedback` route 이동은 사용자가 보던 화면 맥락을 교체한다. 인증된 사용자가 현재 route를 유지한
채 의견을 보내고 명시적으로 닫은 뒤 작업을 이어갈 수 있도록 shell-level 피드백 overlay가 필요하다.

## What Changes

- Web full sidebar, compact rail, mobile drawer의 인증 사용자 피드백 진입을 `UniversalShell` 로컬 상태로 여는
  단일 overlay 버튼으로 변경한다.
- overlay open/close는 URL과 browser history를 변경하지 않으며 `feedback=open` 직접 query는 무시한다.
- 기존 `FeedbackForm`, mutation, success/failure/retry를 재사용하고 form은 `{dirty, submitting}`만 보고한다.
- `<768px` bottom sheet와 `>=768px` 최대 약 `600px`/`85dvh` 중앙 dialog를 제공한다.
- 닫기 버튼, backdrop, `Escape`를 `requestClose`로 통합해 dirty 확인, submitting 차단, focus/scroll 복원과
  배경 차단을 제공한다.
- `/feedback` direct route와 Android/iOS route navigation은 유지하며 guest에는 Web 진입점과 form을 숨긴다.
- browser navigation/reload에 대한 draft 보호와 URL 기반 overlay 복원은 범위에서 제외한다.

## Authority / Provenance

- Canonical: `docs/design/feedback.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`
- Linear Contract: [PROD-594](https://linear.app/byulmaru/issue/PROD-594)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 인증된 Web 사용자의 일반 피드백 진입을 현재 route 위 transient shell overlay로 제공한다.

## Impact

- Web feedback presentation과 shell navigation
- Feedback/Shell Storybook 및 Web E2E
- canonical feedback design과 OpenSpec delta
- API, GraphQL, database, Slack payload, dependencies와 Android/iOS runtime에는 영향이 없다.
