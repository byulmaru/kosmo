## Context

현재 `SidebarNavigation`의 피드백 진입점은 모든 플랫폼에서 보호된 `/feedback` route로 이동한다. `FeedbackPage`는 Web page chrome과 document scroll을 소유하고, `FeedbackForm`은 입력·검증·Relay mutation·성공 초기화·실패 재시도를 내부 상태로 관리한다. `UniversalShellContent`는 full/compact sidebar, mobile drawer, 중앙 `<Slot />`, right rail을 한 번 조립하므로 route tree를 유지한 채 shell 전체를 덮는 Web overlay를 소유할 수 있는 가장 좁은 공통 경계다.

최신 shell은 PROD-591의 mobile Web header 분기를 포함한다. `/feedback` direct route는 이 분기의 대상이 아니며 `FeedbackPage`의 기존 `PageHeader`를 계속 사용한다. `ModalSheet`는 centered `maxWidth: 420` surface와 단순 backdrop close만 제공하므로 이번 responsive 크기, browser history, dirty/submitting guard와 focus lifecycle을 그대로 충족하지 않는다.

## Goals / Non-Goals

**Goals:**

- Web shell의 피드백 진입을 현재 route 위 query-backed overlay로 제공한다.
- 하나의 `FeedbackForm` 구현과 기존 mutation 상태 흐름을 page와 overlay가 공유한다.
- 모든 close source를 동일한 dirty/submitting 정책과 history 결과로 수렴시킨다.
- shell 전체의 background interaction, document scroll과 focus를 보존·복원한다.
- 기존 breakpoint token과 direct `/feedback` fallback을 유지한다.

**Non-Goals:**

- Android/iOS 피드백 navigation 또는 runtime surface 변경
- `FeedbackForm`의 시각 계층, 입력 schema, 성공·오류 문구 재설계
- GraphQL/API, Slack payload, 인증 경계와 새 dependency 변경
- 범용 modal primitive 또는 shell router architecture의 전면 재설계
- Navigation API history index가 없는 환경의 빠른 다중 entry Back 이탈까지 막는 범용 history guard

## Implementation Guidance

### Current Constraints

- `UniversalShellContent` 안에는 desktop sidebar와 mobile drawer의 `SidebarNavigation` 인스턴스가 각각 존재하므로 overlay를 navigation 내부에 두면 중복 인스턴스가 생긴다.
- 중앙 `<Slot />` 내부에 overlay를 두면 sidebar·right rail·mobile chrome까지 일관되게 차단하기 어렵고 route 렌더 lifecycle에 종속된다.
- `FeedbackForm`은 public props가 없어 overlay가 dirty/submitting 상태를 알 수 없다.
- Web document/window가 기본 scroll owner이며 mobile drawer도 별도 body lock을 사용한다. overlay close가 현재 scroll을 새 primary navigation처럼 초기화해서는 안 된다.
- Expo Router query traversal과 Web focus trapping은 Storybook의 현재 pathname/segments mock만으로 완전히 검증되지 않는다.

### Recommended Approach

`UniversalShellContent`에서 shell root `<View>`를 닫은 뒤 `ShellChromeProvider`를 닫기 전에 Web 전용 feedback overlay를 한 번 조립한다. overlay는 중앙 `<Slot />`의 자식이 아니라 full/compact/mobile shell 전체와 나란한 sibling이며, 현재 route와 query에서 open 상태를 읽는다. 두 `SidebarNavigation` 인스턴스는 같은 shell-owned open callback 또는 같은 query destination을 사용하고 mobile Web에서는 drawer를 먼저 닫는다.

overlay는 기존 `ModalSheet`를 확장하지 않는 전용 presentation으로 둔다. React Native Web modal portal을 사용할 수 있지만, 결과적으로 breakpoint별 sheet/dialog geometry, background inert/aria-hidden, body scroll lock, initial focus, focus trap과 restore를 이번 surface 안에서 책임져야 한다. 열기 직전의 active element와 document scroll을 저장하고 overlay가 최종적으로 닫힌 뒤 유효할 때 복원한다.

`FeedbackForm`에는 presentation-neutral 상태 callback만 추가한다. callback은 초기 종류·빈 본문에서 벗어나면 `dirty=true`, Relay mutation이 진행 중이면 `submitting=true`를 보고한다. Form은 query, close, confirmation 또는 history를 알지 않는다. Overlay의 `requestClose`가 close button, backdrop, `Escape`, browser traversal을 받아 submitting이면 차단하고 dirty이면 폐기 확인을 거친 뒤 source에 맞게 back 또는 query-only replace를 수행한다.

fresh-load query overlay는 현재 route의 query 없는 entry를 한 번 만든 뒤 overlay entry를 push하는 단일 same-document barrier를 사용한다. Expo Router의 replace/push 흐름으로 두 entry를 만들고 정규화 중에도 overlay를 유지해 route tree나 draft가 끊기지 않게 한다. 이후 browser back은 이전 document로 빠져나가기 전에 query 없는 현재 route에 도달하므로 기존 `requestClose`가 dirty 확인과 submitting 차단을 적용할 수 있다. 폐기를 확인하거나 clean close하면 그 query 없는 route에 남는다.

Navigation API history index를 제공하는 환경에서는 복원 target의 ID/index와 현재 entry를 비교하고, 빠른 연속 Back으로 target을 지나친 경우 target까지 다시 이동해 `requestClose` 결과를 유지한다. index가 없는 환경의 일반적인 단일 Back은 same-document barrier로 처리하지만, 사용자가 barrier보다 여러 entry를 한 번에 지나가면 현재 document의 `popstate` guard가 이전 document 이탈을 가로채지 못할 수 있다. 이번 범위는 이 제한을 허용한다.

barrier entry를 브라우저 history에서 강제로 압축하거나 제거하지 않는다. 따라서 close 뒤 browser forward가 남은 `feedback=open` entry를 방문해 초기화된 overlay를 다시 열 수 있다. 이를 없애기 위한 raw `history.pushState`, marker, 자동 skip 로직은 Expo Router history와의 이중 상태 및 추가 회귀 위험에 비해 이 변경의 필요 범위를 넘으므로 추가하지 않는다.

### Allowed Alternatives

- 전용 overlay가 spec의 responsive geometry와 lifecycle을 모두 소유한다면 내부에서 기존 `ModalSheet`의 작은 presentation 조각을 조합할 수 있다. 다만 다른 `ModalSheet` 소비자의 계약이나 기본 크기를 변경해서는 안 된다.
- Expo Router navigation guard 또는 Web history listener 중 어느 방식을 사용해도 된다. dirty 취소 시 URL과 overlay가 유지되고, 내부 push와 fresh-load barrier 결과가 spec과 일치해야 한다.
- `beforeunload`, raw history marker·자동 압축 또는 복수 same-document barrier로 no-index 다중 entry 이탈까지 일반화하는 대안은 승인된 범위가 아니다.

### Known Traps

- overlay를 `<Slot />`, `FeedbackPage` 또는 각 `SidebarNavigation` 안에 렌더링해 route를 잃거나 인스턴스를 중복하지 않는다.
- query open을 primary route navigation으로 기록해 document scroll을 최상단으로 초기화하지 않는다.
- `/feedback` direct route 위에 overlay를 중복 렌더링하거나 PROD-591 mobile shell header 대상에 `/feedback`을 추가해 제목을 두 번 표시하지 않는다.
- form에 navigation과 confirmation을 넣거나 성공 후 overlay를 자동으로 닫지 않는다.
- backdrop pointer 차단만으로 keyboard focus와 accessibility tree 차단을 완료했다고 판단하지 않는다.

## Risks / Trade-offs

- [browser back은 이미 시작된 traversal이라 dirty guard 구현이 복잡할 수 있음] → URL, overlay, draft가 취소 후 함께 유지되는지 실제 browser history로 검증한다.
- [fresh-load barrier의 forward entry가 close 뒤 남음] → forward 재진입은 초기화된 form으로 허용하고 history 압축·marker 일반화는 범위에서 제외한다.
- [Navigation API history index가 없는 환경의 빠른 연속 Back은 단일 barrier보다 여러 entry를 지나 이전 document로 이탈할 수 있음] → 일반적인 단일 Back과 index-backed 연속 Back을 검증하고 `beforeunload`·raw marker·복수 barrier 일반화는 제외한다.
- [React Native Web `Modal`만으로 focus trap과 background inert가 충분하지 않을 수 있음] → 명시적 Web focus 관리와 keyboard 수동 QA를 포함한다.
- [drawer body lock과 overlay body lock이 연속되면 scroll 복원이 경쟁할 수 있음] → mobile drawer를 먼저 닫고 같은 scroll 좌표를 overlay lifecycle이 인수하는 경로를 검증한다.
- [shell root 변경이 route header와 rail에 회귀를 만들 수 있음] → overlay가 닫힌 상태의 mobile/compact/full shell story와 기존 shell tests를 함께 실행한다.

## Migration Plan

1. canonical feedback 문서와 `web-app-shell` delta를 동기화한다.
2. form state signal, shell-level overlay와 navigation query를 단계적으로 추가한다.
3. 자동화와 390px·900px·1400px Web runtime QA를 완료한다.
4. 구현 rollback은 overlay 조립과 Web query 진입을 제거해 기존 `/feedback` route navigation으로 되돌릴 수 있으며 데이터 migration은 없다.
5. 이 change의 archive는 `add-web-feedback-slack-delivery` production smoke와 선행 change archive가 완료된 뒤 수행한다.

## Open Questions

없음.
