## Context

`FeedbackPage`는 direct `/feedback` page chrome을, `FeedbackForm`은 입력·검증·Relay mutation과 결과 상태를
소유한다. `UniversalShellContent`는 full/compact sidebar, mobile drawer, 중앙 `<Slot />`과 right rail을 한 번
조립하므로 route tree를 유지한 단일 Web overlay의 가장 좁은 owner다.

## Goals / Non-Goals

**Goals:**

- 인증된 Web shell의 피드백 진입을 현재 route 위 transient overlay로 제공한다.
- page와 overlay가 같은 form과 mutation 흐름을 공유한다.
- 명시적 close source를 동일한 dirty/submitting 정책으로 처리한다.
- shell 배경, document scroll과 focus를 보존·복원한다.
- 기존 breakpoint와 direct `/feedback` fallback을 유지한다.

**Non-Goals:**

- URL/query/history로 overlay 상태 표현 또는 복원
- browser Back/Forward, reload, 주소 이동과 tab close 이탈 보호
- Android/iOS navigation과 surface 변경
- GraphQL/API, Slack payload, 인증 경계와 새 dependency 변경
- 범용 modal/router architecture 재설계

## Implementation Guidance

`UniversalShellContent`가 `feedbackOpen` 로컬 상태를 소유한다. 두 `SidebarNavigation` 인스턴스는 같은
`onFeedbackOpen` callback을 받고 mobile Web은 drawer를 닫은 뒤 overlay를 연다. Overlay는 shell root `<View>`
다음, `ShellChromeProvider` 안에 한 번 조립하며 `<Slot />`이나 navigation 내부에 두지 않는다.

Web 일반 진입은 link가 아니라 button이다. 인증 세션이 있을 때만 표시하고, Android/iOS 또는 현재
`/feedback` page에서는 기존 `/feedback` link semantics를 유지한다. `feedback=open` query는 읽거나 쓰지 않는다.

`FeedbackOverlay`는 기존 `ModalSheet`를 확장하지 않는 전용 presentation이다. breakpoint별 geometry,
background inert/aria-hidden, body scroll lock, initial focus, focus trap과 restore를 소유한다.

`FeedbackForm`은 `{dirty, submitting}` callback만 제공한다. Overlay의 `requestClose`는 닫기 버튼, backdrop과
`Escape`를 받아 submitting이면 무시하고 dirty이면 폐기 확인을 연다. 성공은 overlay를 열린 채 form을
초기화하고, 실패는 draft와 retry를 유지한다. Browser navigation과 reload는 별도 close source로 가로채지 않는다.

## Known Traps

- overlay를 `<Slot />`, `FeedbackPage` 또는 각 navigation 안에 렌더링해 route를 잃거나 중복하지 않는다.
- Web button에 `/feedback` href나 `feedback=open` query를 다시 결합하지 않는다.
- guest shell에 진입점이나 overlay form을 노출하지 않는다.
- form에 navigation/confirmation을 넣거나 성공 직후 자동 close하지 않는다.
- backdrop pointer 차단만으로 keyboard focus와 accessibility tree 차단을 완료했다고 판단하지 않는다.

## Risks / Trade-offs

- shell local state는 reload와 browser history에서 복원되지 않는다. 의도된 transient UI 계약이며 dirty draft도
  해당 외부 navigation에서 보호하지 않는다.
- drawer body lock과 overlay body lock이 연속될 수 있으므로 drawer를 먼저 닫고 focus/scroll 복원을 E2E로
  확인한다.
- shell root 변경은 모든 breakpoint에 영향을 주므로 mobile/compact/full Storybook과 Web E2E를 함께 실행한다.

## Migration Plan

1. canonical feedback 문서와 `web-app-shell` delta를 shell-state 계약으로 동기화한다.
2. query/history helper와 guard를 제거하고 shell state 버튼을 연결한다.
3. Storybook, app unit/typecheck와 Web E2E를 검증한다.
4. rollback은 Web button/overlay 조립을 제거하고 `/feedback` link로 되돌리며 데이터 migration은 없다.
5. archive는 별도 완료 판단이며 `add-web-feedback-slack-delivery` 선행 조건을 유지한다.

## Open Questions

없음.
