## 1. PROD-548 authority와 OpenSpec lifecycle 정렬

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/profile-edit.md`
- `PROD-548`

**Deliverable**

앱 전역 공용 `IconButton` 계약과 구현·검증·archive 책임이 Profile edit lifecycle과 분리되어 추적된다.

**Guardrails**

- `add-local-profile-edit`는 Profile 제품 동작과 PROD-490 통합·archive만 소유한다.
- 새 change는 각 surface의 navigation, persistence, upload, modal, reaction 또는 session 동작을 재소유하지 않는다.

**Verification**

- Canonical·Linear·두 OpenSpec change의 scope와 task owner를 대조한다.
- `add-common-icon-button`과 `add-local-profile-edit` strict validation을 통과시킨다.

- [x] 1.1 Canonical 접근성 계약과 `add-common-icon-button` proposal·spec·design·decision·task를 PROD-548에 맞춘다.
- [x] 1.2 `add-local-profile-edit`에서 PROD-548 section과 PROD-490 archive dependency를 제거하고 두 change를 strict validate한다.

## 2. PROD-548 공용 component 계약과 Profile 적용 경계

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/profile-edit.md`
- `docs/design/profile-tags.md`
- `PROD-548`

**Deliverable**

공용 `IconButton`이 플랫폼 floor, button semantics와 state·ref·event 전달을 보장하고 Profile back·Tag remove에서
기존 visual·제품 동작을 유지한다. Profile header/avatar whole-preview는 기존 content action 계약을 유지한다.

**Guardrails**

- Caller target과 style은 Web 32, iOS 44, Android 48 floor를 낮추지 못한다.
- 공용 component는 모든 surface에 하나의 visual feedback을 강제하지 않는다.
- Profile header/avatar preview와 camera affordance의 단일 whole-image button·비포커스 계약을 바꾸지 않는다.
- Profile 저장, Media와 navigation 동작을 변경하지 않는다.

**Verification**

- 테스트 코드 범위: `apps/app/src/components/ui/IconButton.test.ts`와 기존 Profile story/test의 오범위 assertion 제거.
- 테스트 필요성: target mapping·floor clamp·caller style override·larger target, visual separation, disabled와 추가
  accessibility state 병합, press state·ref·event 전달, 기본 visual feedback 무강제를 직접 검증한다.
- 테스트 제외 범위: 새 fixture·helper·harness, 광범위 snapshot, Profile 제품 동작 coverage 확대와 Native runtime test.
- 관련 component test, Profile story interaction, TypeScript와 formatter를 통과시킨다.

- [x] 2.1 플랫폼 floor와 public override·state/ref/event·visual separation 회귀를 실패하는 component test로 먼저 고정한다.
- [x] 2.2 공용 component가 specs와 Active decisions를 만족하도록 수정하고 component test를 통과시킨다.
- [x] 2.3 Profile header/avatar whole-preview와 관련 story assertion의 오범위 전환을 되돌리고 Profile back·Tag remove만 공용 component로 유지한다.
- [x] 2.4 Profile 관련 기존 자동화와 Storybook interaction을 실행해 button semantics, geometry와 제품 동작 무변경을 확인한다.

## 3. PROD-548 shell·header·modal·reply·search action 전환

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/page-header.md`
- `docs/design/reply-composer.md`
- `PROD-548`

**Deliverable**

UniversalShell menu/back, Post detail back, ModalSheet close, ReplyComposer close와 search clear/recent-delete가 공용
`IconButton`을 사용하면서 기존 navigation, modal, focus와 시각 결과를 유지한다.

**Guardrails**

- Search back Link와 navigation/menu/list row는 전환하지 않는다.
- UniversalShell menu expanded state, search `onPressIn` focus 보존, ReplyComposer submitting state를 유지한다.
- 기존 glyph 크기, target이 더 큰 surface, pressed background·opacity와 배치를 변경하지 않는다.

**Verification**

- 테스트 코드 범위: 공용 component forwarding test를 우선 사용하고, 기존 `Shell.stories.tsx`,
  `Search.stories.tsx`와 `Posts.stories.tsx`에서 직접 관찰할 수 없는 회귀만 가장 가까운 기존 interaction에 보완한다.
- 테스트 필요성: menu expanded, search focus, reply disabled와 각 action 실행 결과가 전환 전과 같음을 검증한다.
- 테스트 제외 범위: navigation·modal·search 제품 기능 coverage 확대, 새 Storybook harness와 unrelated snapshot.
- Web의 compact/full shell, Post detail, modal/reply와 search story/runtime에서 geometry·focus·pressed 결과를 확인한다.

- [x] 3.1 UniversalShell menu/back와 Post detail back을 전환하고 기존 target·expanded·navigation 계약을 유지한다.
- [x] 3.2 ModalSheet와 ReplyComposer close를 전환하고 기존 target·hit region·disabled·pressed 표현을 유지한다.
- [x] 3.3 Search clear와 recent-delete를 전환하고 `onPressIn`, persistence와 input refocus 결과를 유지한다.
- [x] 3.4 관련 기존 자동화와 Web Storybook/runtime을 실행해 visual·focus·제품 동작 무변경을 확인한다.

## 4. PROD-548 media·reaction·logout action 전환

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/post-media-gallery.md`
- `docs/design/reactions.md`
- `PROD-548`

**Deliverable**

Post Composer media add/remove, ReactionSummary more와 compact Logout action이 공용 `IconButton`을 사용하면서 기존
visual geometry, effective input region, 상태와 제품 동작을 유지한다.

**Guardrails**

- Media preview·retry, reaction entry·selector·icon+count action과 noncompact Logout은 전환하지 않는다.
- Media add/remove의 기존 effective input region을 줄이거나 공용 target과 기존 `hitSlop`으로 이중 확장하지 않는다.
- Media remove absolute position, Reaction more의 Web 32/native 44 visual geometry, Logout pending spinner·busy·disabled를 유지한다.
- Media persistence/upload, reaction modal과 logout session 동작을 변경하지 않는다.

**Verification**

- 테스트 코드 범위: `IconButton.test.ts`의 effective target/state 전달과 기존 `Posts.stories.tsx`,
  `Reactions.stories.tsx`, `Shell.stories.tsx`에서 필요한 최소 interaction assertion.
- 테스트 필요성: media disabled·position, Reaction more geometry, Logout pending content와 busy/disabled를 직접 검증한다.
- 테스트 제외 범위: upload·reaction·session 제품 coverage 확대, reaction entry·Post Action Bar 변경과 Native runtime test.
- Web Storybook/runtime에서 media overlay, reaction row와 compact shell visual·pointer·focus 결과를 확인한다.

- [x] 4.1 Post Composer media add/remove를 전환하고 visual size·absolute position과 기존 effective input region을 유지한다.
- [x] 4.2 ReactionSummary more만 전환하고 인접 reaction entry·spacing과 Web 32 visual geometry를 유지한다.
- [x] 4.3 Compact Logout만 전환하고 pending spinner, busy·disabled와 session 결과를 유지한다.
- [x] 4.4 관련 자동화와 Web Storybook/runtime을 실행해 geometry·state·제품 동작 무변경을 확인한다.

## 5. PROD-594·PROD-650 열린 PR 소비자 조정

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/feedback.md`
- `docs/design/post-media-gallery.md`
- `PROD-548`
- `PROD-594`
- `PROD-650`

**Deliverable**

FeedbackOverlay close와 PostMediaViewer close/previous/next가 merge 순서와 관계없이 최종 production 또는 merge
가능한 branch에서 공용 `IconButton`을 사용한다.

**Guardrails**

- PR #486과 #510의 base·stack·제품 scope를 공용화 때문에 임의로 바꾸지 않는다.
- Feedback modal과 PostMediaViewer의 close·navigation 제품 동작과 visual geometry를 변경하지 않는다.
- Retry, reveal과 whole-media content action은 전환하지 않는다.

**Verification**

- 각 조정 시점에 최신 PR head/base/draft/merge 상태와 대상 diff를 다시 읽는다.
- 먼저 production에 들어온 action은 PROD-548 검증에 포함하고, 남아 있는 branch는 자신의 기존 자동화와 Web
  runtime에서 전환 결과를 검증한다.

- [x] 5.1 PR #486·#510과 production의 최신 상태를 읽고 대상별 전환 owner와 merge 순서를 기록한다.
- [ ] 5.2 먼저 merge된 action은 PROD-548 branch가 흡수하고, 공용 component 뒤에 남은 PR은 자신의 대상 action을 전환한다.
- [ ] 5.3 각 소비자 PR의 기존 자동화와 Web runtime에서 close·navigation geometry·focus·제품 동작 무변경을 확인한다.

## 6. PROD-548 통합 검증과 OpenSpec archive

**Authority / Provenance**

- `docs/design/accessibility.md`
- `PROD-548`

**Deliverable**

Production과 열린 PR의 확정 대상이 공용 `IconButton`을 사용하고, Web 완료 증거와 Native 미검증 경계가
명시된 상태에서 `add-common-icon-button`을 archive한다.

**Guardrails**

- 상태형·count·compound·whole-preview 등 제외 대상을 잘못 전환하지 않는다.
- Web 결과를 Native 실제 기기·simulator 완료 증거로 사용하지 않는다.
- 마지막 PR이라는 이유만으로 archive owner를 정하지 않고 실제 남은 전환·통합·정합성 증거를 소유한 PR이 담당한다.

**Verification**

- 구현 시작과 merge 직전 `apps/app/src` production 및 열린 PR inventory를 같은 기준으로 반복한다.
- App unit·typecheck·lint·Storybook build·interaction과 대상 Web runtime을 실행하고 실행하지 못한 검증을 기록한다.
- Canonical·Linear·OpenSpec·구현·PR 본문과 unresolved review thread를 대조하고 archive 전후 strict validation을 확인한다.

- [x] 6.1 구현 시작 inventory에서 포함·제외 대상과 직접 플랫폼 target 계산 baseline을 기록한다.
- [x] 6.2 App unit·typecheck·lint·Storybook build·interaction과 대상 Web runtime 검증을 완료한다.
- [x] 6.3 독립 구현 리뷰에서 target floor, visual 무변경, 상태·제품 동작 전달, 누락과 검증 공백을 확인한다.
- [ ] 6.4 Merge 직전 production/open PR inventory와 review thread를 다시 읽고 새 대상의 누락·잘못된 전환이 없음을 확인한다.
- [ ] 6.5 각 적용 PR 본문에 구현·검증·Native 미실행·남은 owner를 동기화한다.
- [ ] 6.6 모든 task와 cross-PR 완료 증거가 준비되면 실제 마지막 owner가 change를 archive하고 archive 후 validation·Linear 상태를 확인한다.
