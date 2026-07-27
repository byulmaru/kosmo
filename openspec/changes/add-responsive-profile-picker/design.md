## Context

현재 `ProfileSwitcher`는 Relay fragment와 프로필 선택·생성 mutation, transient form/error 상태, Web absolute menu와 native `Modal` surface를 한 컴포넌트에서 함께 소유한다. `UniversalShell`은 breakpoint를 `mobile`·`compact`·`full`로 판정하고 picker open 상태를 제어하며, `SidebarNavigation`은 desktop과 drawer surface에서 같은 picker를 사용한다.

현재 Web menu는 fixed-height 경계나 list scroller 없이 모든 프로필을 일반 `View`에 렌더하고, compact rail 밖으로 absolute 배치된다. 부모 sidebar와 중앙 피드 sibling 사이의 stacking과 ancestor clipping을 surface 차원에서 보장하지 않으므로 compact 본문 위 표시와 긴 목록 접근성을 안정적으로 제공하지 못한다.

## Goals / Non-Goals

**Goals:**

- Web full sidebar와 compact icon rail에 각각 맞는 profile picker surface를 제공한다.
- picker open state, 선택·생성·오류 처리와 Relay actor 전환을 한 흐름으로 유지한다.
- 목록만 scroll owner로 두고 생성 진입과 폼을 고정 footer에 유지한다.
- compact drawer를 본문보다 위에 표시하면서 기존 Web 셸 column 폭과 document scroll을 보존한다.
- Web full과 mobile Web drawer의 이름·chevron trigger에서 6px 광학 보정을 제공하되 hitbox·anchor·navigation geometry를 보존한다.
- 가장 가까운 Storybook surface에서 responsive trigger와 긴 목록 회귀를 검증한다.

**Non-Goals:**

- Android/iOS profile picker를 재설계하지 않는다. Web full과 mobile Web drawer는 trigger의 chevron·6px 광학 보정 외
  content, dismissal과 transient-state lifecycle을 재설계하지 않는다.
- GraphQL schema, mutation payload, Relay normalization·actor reset·cache 정책을 바꾸지 않는다.
- PROD-213 공용 Dropdown 전환이나 PROD-214/215의 별도 오류·Storybook 범위를 흡수하지 않는다.
- 디자인 시스템 또는 Figma 컴포넌트 라이브러리를 전면 정리하지 않는다.

## Implementation Guidance

### Current Constraints

- Web full sidebar와 mobile Web drawer는 현재 모두 `compact=false` 경로를 사용한다. `compact` boolean만으로 full
  overlay surface를 선택하면 제외 범위인 mobile drawer 동작까지 바뀔 수 있다.
- `SidebarNavigation`의 navigation `ScrollView`는 picker를 감싸지 않으므로 긴 picker 목록의 scroll owner로 재사용할 수 없다.
- full profile header는 고정 높이와 absolute child 배치에 의존한다. picker overlay는 프로필 이름 trigger 바로
  아래에 anchor해 그 아래의 profile detail과 navigation 위에 paint하되, flow 높이에 참여하지 않아 navigation의
  닫힌 위치를 유지해야 한다.
- compact drawer는 80px rail 밖으로 확장되므로 sidebar/center sibling의 stacking과 ancestor overflow를 함께 고려해야 한다.
- full·compact Web 바깥 pointer close와 `Escape` 처리는 open 상태 동안만 활성화하고 unmount·close 시 정리해야 한다. 바깥 pointer listener는 이벤트 기본 동작을 막지 않아 pointer 대상의 기본 focus를 유지하며, native 전역 listener나 modal semantics로 확장하지 않는다.
- 현재 `PostComposer`의 Web menu는 open 상태에 한정한 `pointerdown`·`keydown` listener, 선택 항목 초기 focus와 `Escape` focus 복원 패턴을 이미 제공하므로 같은 lifecycle 경계를 재사용할 수 있다.
- 기존 선택 성공은 picker를 닫고 Relay actor를 재생성하며, 생성 성공은 생성된 프로필을 선택한다. 이 데이터 흐름은 layout 변경과 분리해 보존해야 한다.

### Recommended Approach

picker의 Relay data/action state와 반복 content를 유지하되, `full`·`compact`·`drawer` surface를 `compact` boolean과
별개로 명시적으로 전달한다. `ProfileSwitcher`는 trigger, Relay action state, list/footer content를 소유하고 full
surface에서 `SidebarNavigation`이 제공하는 `renderSummary(trigger)` seam을 호출한다. `SidebarNavigation`은 기존
cover·avatar·profile detail과 전달받은 trigger를 정확히 260px 높이의 summary View 안에 렌더한다.
`ProfileSwitcher`는 summary와 같은 root의 absolute layer를 프로필 이름 trigger 바로 아래에 anchor해 navigation
flow 높이에 참여하지 않게 한다.
따라서 닫힌 summary와 navigation 위치, mobile Web drawer·Android/iOS의 기존 header 경로를 모두 유지한다.

desktop full·compact에서는 새 portal이나 dependency를 추가하지 않고 `ProfileSwitcher`의 Web absolute layer를
사용한다. full은 프로필 이름 trigger 바로 아래, compact는 80px rail 오른쪽에 배치한다. `UniversalShell`은 picker가
열린 sidebar sibling의 stacking을 본문보다 높이되 column width는 full 320px, compact 80px로 유지한다. 현재
shell ancestor에는 overflow clipping이 없다는 전제에서 시작하되 768·1024·1279·1280·1440px paint 검증에서
clipping 또는 sibling stacking 실패가 확인되면 이 checkpoint에서 중단하고 portal/layer host 대안을 별도
승인받는다.

compact drawer는 full sidebar 폭과 기존 spacing·radius·semantic color token을 기본값으로 검토하되, 정확한 width·viewport gap은 현재 token과 실제 Storybook viewport에서 조정할 수 있다. full·compact picker root는 기존 surface별 viewport 여백 계산을 유지하면서 최대 430px로 제한하고, list container만 `ScrollView`와 축소 가능한 flex 영역으로 만든다. divider 아래의 add action 또는 create form은 scroll container 밖 footer에 둔다. 기본 상태의 약 7개 가시 행은 목표치이며 실제 행 수보다 footer 접근성과 내부 스크롤을 우선한다.

Web full과 mobile Web drawer는 각각 `Platform.OS === 'web' && surface === 'full' | 'drawer'`인 이름·chevron
trigger visual을 같은 내부 content 경계로 감싸 아래로 6px 이동한다. open 상태에는 위 방향 chevron을 사용하되
trigger root와 picker surface는 이동하지 않아 hitbox, absolute anchor와 navigation geometry를 유지한다. compact
avatar trigger와 Android/iOS에는 적용하지 않는다.

Web의 시각적 picker wrapper가 viewport bounds, border와 overflow를 소유하고, 그 안의 semantic `menu` region은 profile list, separator와 기존 `menuitem` add action까지만 소유한다. create form과 operation error `alert`는 같은 고정 footer 위치를 유지하되 `menu`의 sibling으로 렌더한다. ARIA `menu` descendant에 `form`·`alert`를 넣어 `aria-required-children` 규칙을 위반하거나 a11y 예외를 추가하지 않는다.

full·compact Web picker가 열리면 현재 선택 항목, 선택값이 없으면 첫 항목으로 focus를 이동한다. `ArrowUp`·`ArrowDown`은 항목을 순환하고 `Home`·`End`는 처음과 끝으로 이동하며, DOM focus 이동 뒤 `scrollIntoView({ block: 'nearest' })`로 list viewport 안에 유지한다. `Tab`은 가로채지 않아 비모달 surface의 일반 focus 순서를 보존한다. 이 동작은 프로필 `menuitemradio` 목록에만 적용하고 고정 footer의 새 프로필 추가 action은 기존 `menuitem` focus target으로 유지한다. mobile Web drawer와 native에는 이 keyboard lifecycle을 추가하지 않는다.

full·compact Web open 상태에서는 trigger 재실행, trigger와 picker 밖의 pointer interaction, `Escape`, 프로필
선택 성공을 동일한 close transition으로 모으고 listener를 정리한다. pointer listener는 trigger와 picker
containment를 먼저 확인해 trigger press와 close가 중복 실행되지 않게 하며, pointer event의 기본 동작을 막지
않아 대상의 기본 focus를 따른다. `Escape`로 닫으면 trigger에 focus를 복원한다. 선택·생성 failure는 close
transition을 실행하지 않으며, full·compact Web의 명시적 close transition은 `open=false`, `creating=false`,
빈 handle과 오류 없음으로 초기화한다. mobile Web drawer와 native의 기존 close state 동작은 유지한다.

Storybook fixture는 기존 shell query fixture builder 안에서 10개 이상의 typed profile fixture를 제공한다. full과
compact surface의 trigger·expanded 상태·overlay 위치·navigation 위치 불변·outside dismissal, keyboard focus
가시성, 목록과 footer 접근성을 가장 가까운 story에서 검증하고, 기존 선택·생성 interaction과 Web E2E는 회귀
검증으로 실행한다. 기존 full·mobile story에서는 trigger의 down/up chevron과 이름·icon center가 trigger center보다
6px 아래에 보이는 geometry를 검증한다. Storybook viewport preset이나 새 test harness는 추가하지 않고
768·1024·1279·1280·1440px는 browser resize로 직접 확인해 story URL과 관찰 결과를 기록한다.

### Allowed Alternatives

- full·compact overlay는 현재 shell hierarchy의 React Native Web absolute layer와 open-state sidebar stacking을
  사용한다. exact-width paint 검증에서 이 경계로 clipping을 피할 수 없다고 확인될 때만 구현을 중단하고 Web
  전용 portal/layer host를 후속 대안으로 다시 승인받는다.
- picker content와 surface를 별도 컴포넌트로 추출하거나 현재 컴포넌트 내부의 명확한 하위 render 경계로 유지할 수 있다. 공개 계약과 테스트 seam을 불필요하게 늘리지 않는 쪽을 선택한다.
- 기존 공용 UI primitive는 현재 요구사항을 모두 만족할 때 재사용할 수 있지만 재사용 자체는 완료 조건이 아니다.

### Known Traps

- `compact=false`만 보고 full overlay를 렌더해 mobile Web drawer 또는 native surface까지 바꾸지 않는다.
- `open`만 보고 모든 drawer chevron을 바꿔 Android/iOS trigger에 mobile Web 보정을 누출하지 않는다.
- 6px 보정을 trigger root나 picker wrapper에 적용해 hitbox·anchor 또는 navigation geometry를 이동시키지 않는다.
- rail width를 임시로 320px로 확장해 중앙 피드를 밀거나 breakpoint layout 계산을 바꾸지 않는다.
- navigation `ScrollView`나 picker 전체를 scroll owner로 만들어 footer가 목록과 함께 사라지게 하지 않는다.
- create form이나 operation error `alert`를 semantic `menu` descendant로 넣어 ARIA required-owned-element 규칙을 위반하지 않는다.
- full·compact overlay에 backdrop, focus trap 또는 modal dialog semantics를 추가하지 않는다.
- component-local breakpoint 숫자나 raw color를 새로 만들지 않는다.
- layout 수정과 함께 GraphQL selection, mutation payload, Relay cache updater 또는 actor reset을 정리하지 않는다.
- PROD-213/214/215의 별도 범위를 편의상 함께 구현하지 않는다.

## Risks / Trade-offs

- [compact drawer가 ancestor overflow에 잘릴 위험] → unclipped shell layer를 선택하고 768·1024·1279px Storybook viewport에서 실제 paint order를 확인한다.
- [full overlay가 center/right sibling 뒤에 paint되거나 ancestor overflow에 잘릴 위험] → open-state sidebar
  stacking을 적용하고 1280·1440px Storybook viewport에서 navigation 위치·paint order·clipping을 확인한다.
- [바깥 클릭 listener가 중복 등록되거나 다른 interaction을 방해할 위험] → open 상태에 한정해 등록·정리하고 trigger와 drawer 내부 interaction을 구분한다.
- [full overlay가 navigation을 시각적으로 덮는 동안 picker 밖 document scroll이나 dismissal 접근성을 잃을 위험]
  → picker root를 viewport에 맞게 제한하고 목록만 줄이며, outside·`Escape`·trigger dismissal을 함께 검증한다.
- [Storybook DOM assertion만으로 stacking을 증명하지 못하는 위험] → interaction test와 별도로 1024·1440px 시각 검증을 수행한다.
- [Web surface 분기가 shared native 동작을 회귀시킬 위험] → platform과 shell surface 경계를 명시하고 기존 Android/iOS picker 경로를 변경하지 않는다.
- [430px cap이 생성 footer를 압박할 위험] → list만 줄어드는지와 add/create footer 접근성을 12개 fixture에서 확인한다.
- [full·mobile optical transform이 실제 layout을 이동시킬 위험] → trigger 내부 content만 보정하고 Storybook
  geometry, picker anchor·navigation 불변과 Android/iOS 비변경 diff를 검토한다.
- [`add-shell-responsive-breakpoints`의 compact popover 문구와 최신 drawer 계약이 충돌할 위험] → PROD-238의 최신 canonical·Linear 계약을 구현 authority로 사용하되 기존 change를 이 범위에서 수정하거나 흡수하지 않는다. 최종 active spec sync·archive 전에 두 delta의 적용 순서와 최종 drawer 문구를 확인하는 stop gate를 둔다.

## Migration Plan

1. canonical 디자인 문서와 OpenSpec delta를 먼저 반영하고 strict validation한다.
2. Web full/compact surface와 list/footer layout을 구현하고 최대 높이를 430px로 제한한다.
3. Web full과 mobile Web drawer trigger의 chevron·6px 내부 광학 보정을 추가한다.
4. 10개 이상 fixture와 최소 interaction 검증을 추가하고 기존 선택·생성 E2E를 실행한다.
5. Storybook browser를 mobile·768·1024·1279·1280·1440px로 직접 조절해 responsive surface와 stacking을 시각 검증한다.
6. `add-shell-responsive-breakpoints`의 이전 compact popover 문구가 최종 active spec에 남지 않도록 change 적용 순서와 archive sync 결과를 확인한다.

데이터 migration과 rollout flag는 필요하지 않다. 회귀 시 Web surface 변경만 되돌리고 기존 ProfileSwitcher 데이터 흐름을 유지할 수 있다.

## Open Questions

없음.
