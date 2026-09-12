## Context

PROD-854가 만든 `PostComposerTarget`, `PostComposerMediaItemsTarget`, `ComposerMediaEditor`는 현재 Storybook에서만 소비된다. Production의 `PostComposer`는 본문·Content Warning·공개 범위·Media upload·`createPost` 상태를 이미 소유하고 `RightRail`과 `/compose`가 각각 렌더링한다. PROD-796은 `SidebarNavigation`과 `BottomTabBar`의 글쓰기 destination을 `/compose` link로 연결하지만 modal/fullscreen lifecycle은 소유하지 않는다.

## Goals / Non-Goals

**Goals:**

- 공용 presentation을 기존 일반 Post 작성 상태와 mutation에 연결한다.
- 하나의 draft를 Rail, Overlay, Media editor 전환에서 유지한다.
- shell breakpoint와 platform에 맞는 진입·dismiss·focus·keyboard lifecycle을 제공한다.
- 현재 Media upload, Relay actor와 `/compose` 인증 경계를 보존한다.

**Non-Goals:**

- GraphQL/API/DB 모델, upload protocol 또는 Relay connection updater 변경
- Poll·Emoji·이미지 crop/회전/초점 기능 구현
- Profile switching lifecycle 또는 Reply presentation 재설계

## Implementation Guidance

### Current Constraints

- `PostComposer` 안의 local state와 mutation을 presentation별로 복제하면 Rail에서 Overlay로 전환할 때 draft가 끊어진다.
- compact/mobile 글쓰기 trigger는 현재 link이므로, 같은 navigation presentation을 유지하면서 compose destination만 host open action으로 연결해야 한다.
- `PostComposerTarget`의 Poll·Emoji callback은 public presentation 계약에 존재하지만 Product 기능은 준비되지 않았다. Production adapter는 해당 action을 숨겨야 한다.
- `MobileFullscreenComposerShellCandidate`의 keyboard는 illustrative UI다. 실제 safe area, keyboard avoidance와 back 처리는 상위 runtime이 제공해야 한다.
- Storybook `ComposerOverlayFixture`는 Production modal semantics, focus trap/restore 또는 router lifecycle을 제공하지 않는다.

### Recommended Approach

기존 `PostComposer`를 작성 상태·upload·mutation owner로 유지하고, 그 render layer만 공용 target과 editor에 연결한다. shell에 composer open 상태와 trigger ref를 두어 Full Web에서는 같은 composer owner가 Rail을 표시하고, Expand 시 동일 owner의 Overlay view로 전환한다. compact/mobile navigation adapter는 compose destination만 route link 대신 이 open callback에 연결한다.

Overlay host는 저장소의 기존 modal/focus 처리 패턴을 재사용해 scrim, Web Escape·backdrop·focus restore, Native back과 safe area/keyboard avoidance를 소유한다. Media editor는 Overlay host 내부 view state로 전환하고 별도 modal을 만들지 않는다. `/compose` route는 기존 query·session/profile 경계를 유지하되 동일 composer host를 열거나 같은 host content를 렌더하는 얇은 호환 adapter로 축소한다.

일반 Post 성공 callback은 기존 state reset 이후 surface별 후속 동작만 위임한다. Web Overlay는 닫고 현재 route를 유지하며, 모바일은 닫은 뒤 Home으로 이동한다. 실패 시 기존 draft와 열린 surface를 유지한다.

### Allowed Alternatives

- shell이 아니라 route group layout에 host를 둘 수 있다. 단, Rail·Overlay·모바일이 동일 draft owner와 Relay actor lifecycle을 공유하고 navigation presentation이 state를 소유하지 않아야 한다.
- `/compose`는 host open을 지시한 뒤 Home으로 replace하거나 route 자체에서 같은 fullscreen content를 렌더할 수 있다. 직접 URL, back 동작과 성공 후 Home 계약을 runtime 검증해야 한다.

### Known Traps

- Target의 props에 맞추려고 upload/mutation 상태를 새 hook이나 store로 복제하지 않는다.
- Rail과 Overlay에 `PostComposer`를 동시에 mount해 두 draft와 두 mutation owner를 만들지 않는다.
- Media editor에 별도 `ModalSheet`나 scrim을 중첩하지 않는다.
- illustrative keyboard와 Storybook fixture를 runtime 구현 또는 검증 증거로 사용하지 않는다.
- Poll·Emoji action에 no-op callback을 연결해 활성 control로 노출하지 않는다.
- 일반 Post 연결을 `ReplyComposerSurface` 변경으로 확장하지 않는다.
- 본문·CW·ALT 입력은 `docs/design/figma.md`의 2026-09-12 검토 결정에 따라 caret·selection으로 focus를
  표시한다. 공용 `TextField`의 outline·focused border 두께는 해당 consumer에서만 해제하고 외곽 강조는
  추가하지 않는다. 버튼·탭의 focus 표시와 상위 host의 focus 이동·trap·restore는 유지한다.

## Risks / Trade-offs

- [Risk] shell-level host가 route content와 서로 다른 Relay fragment owner를 만들 수 있음 → selected Profile fragment는 한 query owner에서 선언하고 기존 actor boundary 재생성에 따라 host도 다시 평가한다.
- [Risk] breakpoint 변경 중 Rail과 Overlay가 remount되어 draft가 손실될 수 있음 → 작성 state owner를 presentation 조건보다 위에 유지하고 resize 전환을 component test로 검증한다.
- [Risk] modal focus·body scroll lock이 drawer/feedback overlay와 충돌할 수 있음 → 기존 overlay 패턴을 재사용하고 동시에 열린 surface를 차단하는 실행 검증을 추가한다.
- [Risk] Web 자동화만으로 Native 완료를 오판할 수 있음 → Android·iOS keyboard, back, touch target과 보조 기술 검증을 별도 완료 gate로 기록한다.

## Migration Plan

1. Production adapter와 관련 component tests를 추가해 기존 작성 상태를 공용 presentation에 연결한다.
2. Full Web Right Rail과 compact/mobile 글쓰기 진입을 같은 host에 연결한다.
3. `/compose`를 호환 adapter로 정리하고 Web·Native surface별 lifecycle을 검증한다.
4. 회귀 시 navigation entry를 기존 `/compose` link로 되돌리고 기존 `PostComposer` render를 복원할 수 있도록 API·DB 변경 없이 배포한다.

## Open Questions

없음.
