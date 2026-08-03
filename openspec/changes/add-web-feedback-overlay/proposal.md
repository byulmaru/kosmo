## Why

현재 Web 셸의 `피드백 보내기` 진입은 `/feedback` 독립 화면으로 이동해 사용자가 보던 route, scroll, focus 맥락을 끊는다. 인증된 사용자가 현재 화면을 유지한 채 의견을 보내고 명시적으로 닫은 뒤 원래 작업을 이어갈 수 있도록 shell-level 피드백 오버레이가 필요하다.

## What Changes

- Web의 full sidebar, compact rail, mobile drawer에서 일반 피드백 진입을 현재 URL의 `feedback=open` query로 여는 단일 shell-level 오버레이로 변경한다.
- 기존 `FeedbackForm`, `submitFeedback` mutation, 성공·실패·재시도 동작을 재사용하고 form은 `{ dirty, submitting }` 상태만 presentation에 보고한다.
- Web `<768px`에서는 bottom sheet, `>=768px`에서는 최대 약 `600px` 너비와 `85dvh` 높이의 중앙 dialog를 제공한다.
- browser back, `Escape`, backdrop, 닫기 버튼을 하나의 `requestClose` 경계로 통합하고 dirty 확인, submitting 차단, focus trap·복원, 배경 상호작용 차단과 scroll 복원을 제공한다.
- `/feedback` 직접 접근과 새로고침은 기존 보호 route의 독립 페이지 fallback으로 유지한다.
- Android/iOS 피드백 진입과 화면, GraphQL/API, Slack 전달 계약, 피드백 필드 정책은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/feedback.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`
- Linear Contract: [PROD-594](https://linear.app/byulmaru/issue/PROD-594)
- Linear Implementations: [PROD-594](https://linear.app/byulmaru/issue/PROD-594)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Web 피드백 진입을 현재 route 위 query-backed overlay로 변경하고, direct `/feedback` fallback과 Native 진입은 유지한다.

## Impact

- Web feedback presentation: `apps/app/src/components/feedback/FeedbackForm.tsx`, 새 Web overlay surface
- Shell/navigation: `apps/app/src/components/shell/UniversalShell.tsx`, `SidebarNavigation.tsx`
- Router test support and verification: Storybook Expo Router mock, Feedback/Shell stories, Web E2E
- Canonical design: `docs/design/feedback.md`
- API, GraphQL schema, database, Slack payload, dependencies, Android/iOS runtime에는 영향이 없다.
