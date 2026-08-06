## Context

현재 `apps/app`의 compact action은 각 surface가 React Native `Pressable`, target geometry, accessibility state와
pressed·disabled 표현을 직접 소유한다. 현재 PROD-548 branch의 `IconButton`은 Web 32, iOS 44, 기타 48을
기본값으로 제공하지만 caller `targetSize`와 뒤에 적용되는 caller style이 floor를 낮출 수 있고, 모든 소비자에
opacity feedback을 기본 적용한다. 또한 Profile header/avatar whole-preview를 `IconButton`으로 바꿔 새 scope의
명시적 제외와 충돌한다.

현재 production에는 서로 다른 visual size, hit region, focus handler, absolute positioning과 상태를 가진 14개
대상 action이 있다. PR #486의 FeedbackOverlay close는 production에 먼저 들어와 흡수 대상이 됐고, 열린 PR
#510은 3개 action을 추가한다. React Native 0.85.3의 Native Pressability는
`hitSlop`으로 responder region을 확장하지만, 현재 React Native Web 0.21.2의 Pressable source에서는 같은 확장
근거를 확인하지 못했다. 따라서 작은 visual box의 기존 `hitSlop`만 공용 Web floor의 근거로 사용할 수 없다.

각 surface의 navigation, search focus, media persistence, modal, reaction과 logout 동작은 기존 component와
OpenSpec이 계속 소유한다. 이 change는 그 제품 동작을 재정의하지 않고 공용 target primitive 적용만 소유한다.

## Goals / Non-Goals

**Goals:**

- single-action compact square control의 플랫폼 floor와 button semantics를 하나의 공용 primitive에 둔다.
- visible geometry와 interaction target을 분리하고 기존 위치·색상·feedback·focus·hit region을 보존한다.
- 현재 production과 열린 PR에서 확인된 모든 대상 action을 누락 없이 전환한다.
- component 자동화, surface 회귀 검증과 Web runtime 증거를 남기고 Native 검증 경계를 정직하게 기록한다.
- PROD-548를 Profile edit lifecycle에서 분리해 cross-surface change로 완료한다.

**Non-Goals:**

- 상태형·icon+count·pill·tab·switch, Link·row, whole-preview/content action과 compound control 전환
- surface별 navigation, persistence, upload, modal, reaction 또는 session 동작 변경
- 텍스트 `Button` 재설계, 새 icon library나 runtime dependency 도입
- iOS·Android 실제 기기·simulator runtime QA와 Native 출시 gate 완료

## Implementation Guidance

### Current Constraints

- `IconButton`의 caller style은 target floor 뒤에 적용되므로 현재 floor를 덮을 수 있다.
- 현재 `feedback="opacity"` 기본값은 pressed feedback이 없거나 background만 바뀌던 surface의 시각 동작을
  바꿀 수 있다.
- visual 32·40·44와 기존 `hitSlop`을 그대로 둔 채 Pressable 자체도 48로 키우면 effective input region이
  이중 확장되거나 인접 target과 겹칠 수 있다.
- Web은 `hitSlop` 효과가 local installed source에서 입증되지 않았으므로 실제 rendered target을 측정해야 한다.
- Profile header/avatar preview는 canonical하게 각각 하나의 whole-image button이지만 compact `IconButton`은 아니다.
- menu expanded, search `onPressIn`, media disabled·absolute overlay, Reaction more geometry, Logout busy·spinner는
  각 소비자가 보존해야 하는 기존 계약이다.
- PR #486은 먼저 merge되어 production 흡수 대상이고, PR #510의 merge 순서는 PROD-548가 고정하지 않는다.

### Recommended Approach

공용 component는 Web에서 requested target과 32 floor 중 큰 값을 실제 interactive element의 minimum target으로
계산하고 caller style 뒤에 적용한다. Native에서는 requested visual·layout box를 유지하고 iOS 44, Android 48에
부족한 절반 값을 공용 `hitSlop` 최소값으로 병합한다. Visible control은 별도 내부 visual layer에 두어 glyph,
background와 surface별 feedback을 기존 크기로 유지한다. Target positioning과 visual styling을 분리할 수 있는
style seam을 제공하되, 공용 component는 기본 visual opacity나 background를 강제하지 않는다.

기존 `hitSlop` action은 전환 전 effective region을 먼저 계산한다. Web actual target과 Native 공용 부족분이 기존
expansion과 중복되지 않게 큰 값을 사용하고, 더 큰 기존 target은 requested target으로 유지한다. Web에서는
rendered bounding box, pointer와 keyboard focus를 함께 확인한다.

State와 behavior는 Pressable contract를 통해 전달한다. Disabled는 실제 `disabled`와 accessibility state를
일치시키고, busy·expanded 등 다른 state를 병합한다. Children과 style은 press state를 받을 수 있고 focus ref,
`onPressIn`, `hitSlop`을 포함한 필요한 event·interaction prop은 보존한다. Ref 전달의 구체적인 React API는 현재
저장소와 React Native type에 맞는 가장 작은 방식을 사용한다.

Outer `style`이 press state를 받는 함수라면 component가 안정적인 layout 크기를 추론할 수 없으므로
`targetSize` 또는 `visualSize` 중 하나를 public type에서 필수로 요구한다. 정적 square style의 width·height 추론은
유지하고, 함수 callback을 임의의 state로 미리 실행하거나 별도 `layoutSize` prop을 추가하지 않는다.

전환은 다음 묶음으로 진행한다.

1. 현재 잘못 적용된 Profile header/avatar whole-preview와 관련 Storybook assertion을 기존 `Pressable` 계약으로
   되돌리고 Profile back·Tag remove만 유지한다.
2. 공용 component의 floor·visual separation·state/ref/event contract를 component test로 고정한다.
3. shell/header/modal/reply/search action을 전환하고 navigation·focus·expanded state를 검증한다.
4. media/reaction/logout action을 전환하고 visual geometry·absolute position·disabled/busy state를 검증한다.
5. 구현 시작과 merge 직전 production/open PR inventory를 반복한다.

열린 PR에는 승인된 동적 소유 규칙을 사용한다. 먼저 merge된 #486은 PROD-548가 최신 production을 반영해
흡수하고, 공용 component merge 뒤에도 열려 있는 #510은 최신 production을 반영해 자신의 대상 action을 merge
전에 전환한다. 별도 stack이나 PR base 변경을 기본 경로로 만들지 않는다.

### Allowed Alternatives

- Internal visual layer 대신 동등한 wrapper 구조를 사용해도 된다. 단, Web actual floor, Native effective target
  mapping, visible geometry, focus와 현재 scope의 overlap·clipping requirement를 동일하게 충족해야 한다.
- Standard ref forwarding 또는 저장소 type과 호환되는 명시적 ref prop을 사용할 수 있다. 소비자 focus 계약과
  public type이 동등해야 한다.
- Surface별 기존 테스트에 assertion을 추가하거나 공용 Storybook story에서 geometry를 검증할 수 있다. 각
  고위험 제품 동작을 관찰 가능한 결과로 직접 증명해야 한다.

### Known Traps

- Web `minWidth`·`minHeight`를 caller style보다 먼저 적용해 floor를 다시 우회하게 만드는 것
- 함수형 outer style의 크기를 추론하지 못하면서 size prop 없이 플랫폼 default layout을 적용하는 것
- Native visual·layout box와 공용 `hitSlop`을 동시에 확대해 effective region을 두 번 키우는 것
- 모든 소비자에 같은 opacity feedback을 기본 적용하는 것
- icon library나 glyph 종류를 공용 component API에 고정하는 것
- Search back Link, Profile preview, media retry, reaction entry나 Post Action Bar를 inventory 숫자만 보고 전환하는 것
- Web 자동화 결과를 Native target·VoiceOver·TalkBack runtime 증거로 보고하는 것
- PROD-548 task를 `add-local-profile-edit`의 PROD-490 archive gate에 계속 연결하는 것

## Risks / Trade-offs

- [Web actual target 확대로 layout slot이나 absolute center가 이동할 수 있음] → visual layer와 target style을
  분리하고 기존 화면 중심 좌표·간격을 Storybook과 Web runtime에서 비교한다. Native는 기존 layout box를 유지한다.
- [작은 overlay target이 인접 action 또는 부모 bounds와 충돌할 수 있음] → effective region을 계산하고
  overlap·clipping을 surface별로 검증한다.
- [기존 `hitSlop` 제거가 Native touch behavior를 바꿀 수 있음] → source mapping과 자동화에는 의도를 남기고
  실제 Native 결과는 출시 gate의 runtime 검증 공백으로 기록한다.
- [열린 PR merge 중 새 직접 Pressable이 생길 수 있음] → merge 직전 inventory와 동적 소유 규칙으로 흡수한다.
- [여러 기존 OpenSpec이 제품 동작을 중복 소유할 수 있음] → 새 change는 공용 primitive와 전환 증거만 소유하고
  각 surface change의 제품 behavior·archive 책임을 가져오지 않는다.

## Migration Plan

1. Canonical 접근성 문서와 이 change를 PROD-548 authority에 맞춘다.
2. `add-local-profile-edit`의 PROD-548 section과 archive dependency를 원래 Profile edit 경계로 되돌린다.
3. 공용 component와 최소 component test를 수정한 뒤 Profile의 오범위 적용을 제거한다.
4. 현재 production 대상 14개 action을 위험 묶음별로 전환하고 각 묶음의 회귀 검증을 수행한다.
5. PR #486/#510 상태를 다시 읽고 동적 소유 규칙에 따라 production의 FeedbackOverlay close와 열린 #510
   branch의 3개 action을 전환한다.
6. 전체 app 자동화, Storybook build·interaction과 Web runtime을 실행하고 merge 직전 inventory를 기록한다.
7. 모든 적용 PR의 전환 증거가 준비되면 마지막 완료 증거를 소유한 PR이 이 change를 archive한다.

부분 전환을 rollback해야 하면 해당 surface만 이전 `Pressable` 구현으로 되돌릴 수 있다. 공용 component와 이미
검증된 소비자는 유지하며, floor를 우회하는 임시 fallback이나 중복 target 계산을 추가하지 않는다.

## Open Questions

없음. PR merge 순서에 따른 전환·archive owner는 위 동적 소유 규칙으로 결정한다.
