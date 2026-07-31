## Context

Expo Router의 `(tabs)` route tree는 `UniversalShell` 안에서 렌더링되고, Web 셸은 document/window를 기본
scroll owner로 사용한다. 하단 탭과 sidebar 계열은 공통 `GuardedLink`를 사용하지만 navigation guard가 없는
경로는 `Link`의 기본 이동을, dirty guard가 있는 경로는 승인 뒤 `router.navigate`를 실행한다. 현재 셸에는
path-changing 주요 navigation과 browser history traversal을 구분해 document scroll을 초기화하는 경계가 없다.

`usePathname`은 search query 변경을 제외한 pathname만 제공하므로 query-only 보존에는 유리하지만, pathname
변화만 관찰하면 주요 forward navigation과 browser back/forward를 구분할 수 없다. 또한 post detail pagination은
Web의 `window.scrollY`와 document 높이를 소비하므로 중앙 internal scroller를 새로 만들거나 전역 history
restoration을 끄면 기존 계약을 깨뜨린다. PROD-622·PROD-623의 drawer scroll/close 변경은 같은 shell 파일을
건드릴 수 있지만 별도 행동 계약과 검증 생명주기를 가진다.

## Goals / Non-Goals

**Goals:**

- 실제로 실행된 Web 주요 forward navigation만 식별해 대상 pathname이 반영된 뒤 document top으로 이동한다.
- loading·empty route와 빠른 연속 전환에서도 마지막 대상 route의 위치에 안정적으로 수렴한다.
- browser history restoration, search query-only scroll/focus와 navigation guard를 보존한다.
- mobile, compact, full 셸의 서로 다른 navigation surface가 같은 정책 경계를 사용하게 한다.

**Non-Goals:**

- Android/iOS `ScrollView` 위치 정책 또는 Web shell scroll owner 변경
- 현재 홈 재선택의 최상단 이동·refetch와 다른 현재 route 재선택 정책 구현
- Relay refetch, route loading 정책 또는 전체 반응형 navigation E2E suite 변경
- PROD-622의 drawer 내부 scroll/body lock이나 PROD-623의 drawer close lifecycle 구현

## Implementation Guidance

### Current Constraints

- Shell navigation은 guard가 없는 기본 `Link` 경로와 guard 승인 뒤 실행되는 action 경로가 있어, press 시점에
  scroll reset을 예약하면 취소된 navigation에도 부작용이 남을 수 있다.
- Pathname 변화만 구독하는 무조건적인 reset은 browser back/forward도 최상단으로 덮어쓴다.
- Search 내부의 `router.push`/`setParams`는 pathname이 같고 현재 scroll·focus를 유지해야 한다.
- 대상 route는 Relay loading 또는 empty surface부터 commit될 수 있으므로 데이터 완료를 기다리면 이전 offset이
  노출되고, source route에서 너무 일찍 reset하면 화면이 이동 전에 튈 수 있다.
- 빠른 연속 navigation에서 취소되지 않은 timer나 animation frame은 마지막 route가 표시된 뒤 stale reset을
  실행할 수 있다.
- 같은 shell 파일에 sibling issue 변경이 병렬로 존재할 수 있으므로 drawer scroll/close diff를 이 change에
  흡수하지 않고 현재 branch 기준으로 통합해야 한다.

### Recommended Approach

Shell-level 주요 navigation source가 현재 pathname과 다른 target pathname으로 **실제 navigation action을
실행할 때** Web-only pending intent를 기록하고, `(tabs)` shell이 이후 commit된 pathname과 그 intent의 target을
대조하는 방식을 기본으로 한다. Guard가 있는 경우에는 사용자의 첫 press가 아니라 guard가 허용한 action 안에서
intent를 기록해 취소된 이동을 제외한다. Guard가 없는 `Link` 경로도 같은 intent 경계를 통과하게 해 surface별
동작 차이를 만들지 않는다.

대상 pathname이 commit되면 shell의 post-commit effect에서 document를 즉시 top으로 이동하고 intent를
소비한다. Layout 준비를 위해 browser frame을 사용해야 한다면 pathname과 단조 증가 token을 다시 확인하고 이전
frame을 취소해 마지막 navigation만 유효하게 한다. Scroll은 smooth animation 없이 `auto` 동작을 사용해 이전
offset 노출과 연속 전환 race를 줄인다.

Browser back/forward와 search 내부 query-only 이동은 shell primary-navigation intent를 만들지 않으므로 기존
browser/Expo Router 정책을 따른다. 현재 pathname과 같은 target도 intent를 만들지 않아 PROD-610과 다른
reselection 정책을 침범하지 않는다. Native에서는 이 coordination 경계가 no-op이어야 한다.

검증은 navigation intent의 생성·소비·취소와 guard 승인 시점을 가까운 component test로 고정하고, Web E2E에서
스크롤된 source → 다른 target의 top, loading/empty target, 연속 전환, history back/forward, search query-only
scroll/focus를 확인한다. Mobile bottom tab/drawer와 compact/full sidebar는 전체 IA suite가 아니라 같은 scroll
정책을 공유한다는 targeted assertion으로 검증한다.

### Allowed Alternatives

- Pending intent를 shell-local state, 전용 context 또는 좁은 hook으로 소유할 수 있다. 어느 방식이든 실제
  navigation action과 post-commit pathname을 짝지어야 하며 history/query-only/reselection 경계를 보존해야 한다.
- Commit 직후 동기 layout effect 또는 취소 가능한 한 번의 animation frame을 사용할 수 있다. 대상 route가
  표시되기 전 source 화면을 움직이거나 stale callback이 마지막 route에 개입해서는 안 된다.
- 기존 `GuardedLink`를 확장하거나 shell navigation 전용 wrapper에서 intent를 연결할 수 있다. 콘텐츠 내부의
  모든 Link에 전역 적용하거나 route별 reset을 복제해서는 안 된다.

### Known Traps

- `useEffect([pathname])`만으로 모든 pathname 변경을 top으로 보내 browser history restoration을 깨뜨리는 방식
- Press 시점이나 drawer close 시점에 `window.scrollTo`를 호출해 guard 취소·지연과 source route에 적용하는 방식
- 취소되지 않은 `setTimeout`/animation frame으로 연속 전환 뒤 stale reset을 실행하는 방식
- `history.scrollRestoration = "manual"`, smooth scroll 또는 중앙 internal scroller로 문제를 우회하는 방식
- Search query/tab 변경, 현재 route 재선택, Native navigation 또는 Relay refetch까지 정책을 확장하는 방식
- PROD-622·PROD-623의 병렬 drawer 변경을 current issue task나 commit에 함께 포함하는 방식

## Risks / Trade-offs

- [Risk] Expo Router `Link` 기본 이동과 guarded imperative 이동의 실행 시점이 다르다. → 두 경로가 동일한 실제
  navigation intent 경계를 통과하는 component test를 둔다.
- [Risk] Post-commit effect가 target layout보다 빠르거나 늦어 flicker가 생길 수 있다. → loading surface를 포함한
  실제 browser assertion으로 timing을 확인하고, 필요한 경우 한 번의 취소 가능한 frame만 사용한다.
- [Risk] 연속 navigation에서 이전 intent가 마지막 route를 오염시킬 수 있다. → target pathname과 token을 함께
  검증하고 새 intent가 이전 callback을 무효화한다.
- [Risk] Sibling drawer 변경과 같은 파일을 수정해 merge conflict가 날 수 있다. → behavioral ownership을 섞지
  않고 최신 parent/base에 맞춰 작은 integration diff로 유지한다.

## Migration Plan

1. Canonical scroll 정책과 `web-app-shell` delta를 먼저 반영한다.
2. Shell primary-navigation intent와 post-commit reset을 Web-only로 추가한다.
3. Component test와 targeted Web E2E로 forward/history/query/reselection 경계를 검증한다.
4. PROD-619의 구현·개별 검증과 delta spec 정합성이 모두 완료되면 이 change를 archive한다. PROD-617의 다섯
   하위 이슈 통합 검증은 이후 별도 책임으로 남는다.

Rollback은 shell intent/reset integration과 관련 테스트를 되돌려 Expo Router/browser의 기존 scroll 동작으로
복귀한다. DB, schema 또는 데이터 migration은 없다.

## Open Questions

없음. 2026-07-31 사용자 승인과 최신 `PROD-619` 본문이 forward/history/query/reselection/Native 경계를 확정했다.
