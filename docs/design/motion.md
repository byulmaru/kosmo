# Motion·transition·reduced-motion 규칙

이 문서는 DSN-18에서 확정한 KOSMO의 motion 계약이다. 시각 정본은 Figma [`04 Motion · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1772-890), 재생 가능한 대표 예시는 [`KOSMO Motion Playground · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1774-880)이다.

finite transition, 반복 loading cycle, toast 체류시간과 focus scheduling은 서로 다른 개념으로 관리한다. 하나의 duration을 모든 motion에 재사용하지 않는다.

## Motion token

Figma의 active collection은 `KOSMO Motion`이며 단일 `Value` mode를 사용한다. duration 값의 단위는 ms다.
`skeleton-wave`는 PROD-1018의 앱 구현 값이며 Figma Motion 정본 반영을 기다리고 있다.

| Token                           |                 값 | 역할                                  |
| ------------------------------- | -----------------: | ------------------------------------- |
| `motion/duration/instant`       |                0ms | 애니메이션 없는 즉시 상태 전환        |
| `motion/duration/fast`          |              120ms | hover·pressed·짧은 exit               |
| `motion/duration/standard`      |              200ms | selected·toast·일반 상태 전환         |
| `motion/duration/emphasized`    |              360ms | modal·drawer의 공간 변화가 있는 enter |
| `motion/duration/reaction`      |              300ms | like·reaction의 유한한 확인 피드백    |
| `motion/duration/loading-cycle` |              800ms | indeterminate spinner 한 바퀴         |
| `motion/duration/skeleton-wave` |             2000ms | Skeleton highlight wave               |
| `motion/easing/standard`        | `.17, .73, .14, 1` | 일반 상태 전환                        |
| `motion/easing/enter`           |    `.16, 1, .3, 1` | 빠르게 나타나 안정적으로 정착         |
| `motion/easing/exit`            |      `.4, 0, 1, 1` | 주의를 끌지 않고 빠르게 퇴장          |
| `motion/easing/linear`          |           `linear` | indeterminate spinner의 일정한 회전   |

`motion/duration/loading-cycle`은 finite transition에 사용하지 않는다. Toast의 기본 체류시간 `3000ms`도 motion token이 아니라 제품 lifecycle 값이다.

## Component 사용표

| 역할               | Duration                 | Easing     | 표현                                                                 |
| ------------------ | ------------------------ | ---------- | -------------------------------------------------------------------- |
| Hover·Pressed      | `fast` 120ms             | standard   | color·opacity, 필요한 경우 scale `0.98`                              |
| Selected           | `standard` 200ms         | standard   | indicator 위치, surface·border·color                                 |
| Modal·Drawer enter | `emphasized` 360ms       | enter      | scrim fade와 짧은 position·opacity 변화                              |
| Modal·Drawer exit  | `standard` 200ms         | exit       | position·opacity를 함께 정리                                         |
| Toast              | enter 200ms / exit 120ms | enter/exit | translate·opacity, 체류시간은 별도                                   |
| Reaction           | 별도 유한 확인 전이 없음 | —          | 선택·count 의미는 즉시 반영; pending spinner만 `loading-cycle` 800ms |
| Spinner            | `loading-cycle` 800ms    | linear     | rotation만 반복                                                      |
| Skeleton           | `skeleton-wave` 2000ms   | linear     | placeholder highlight 이동 후 2000ms 대기, 반복                      |

Underline Tabs에서는 64px 선택 바의 양 끝이 새 위치까지 서로 다른 속도로 동시에 이동해 탭 사이 거리에 따른 폭 변화가 생긴다. 초기 배치·레이아웃 변경·reduced-motion에서는 최종 위치와 크기를 즉시 반영한다.

상태의 의미와 accessible state는 motion 완료를 기다리지 않고 즉시 갱신한다. focus 이동·복원과 `requestAnimationFrame` scheduling은 시각 transition으로 분류하지 않는다.

## 공용 컨트롤의 상태 전이

hover·pressed의 진입과 해제는 모두 `fast` 120ms, selected·checked의 선택과 해제는 모두
`standard` 200ms를 사용한다. 도착 상태가 선택되지 않았다는 이유로 선택 해제를 120ms로 줄이지 않는다.
같은 속성에서 여러 상태가 겹치면 아래의 기존 시각 우선순위를 유지한다. hover·pressed 표현으로
들어가거나 그 표현에서 복귀하는 전이는 120ms이고, 선택 표현만 바뀌는 전이는 200ms다.
선택 상태가 hover를 가리는 컴포넌트에서는 가려진 hover 변화만으로 선택색을 바꾸지 않는다.

| 컨트롤              | Hover·Pressed 120ms                                | Selected·Checked 200ms                              | 즉시 반영·겹침 규칙                                                                                                    |
| ------------------- | -------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Button              | 기존 surface·opacity feedback                      | 없음                                                | disabled·busy 의미와 disabled 표현은 즉시 반영한다.                                                                    |
| IconButton          | 원형 feedback surface                              | 없음                                                | 일회성 action에 selected 상태를 추가하지 않는다. disabled opacity는 즉시 반영한다.                                     |
| ListboxOption       | hover·active·pressed surface                       | 선택 surface·border                                 | surface는 disabled > pressed > selected > active·hover 순서다. focus ring은 즉시 반영한다.                             |
| BottomTabBar        | feedback surface·기존 pressed scale                | 선택 label·icon 색상                                | feedback과 선택 의미는 독립이다. 선택 glyph·unread 표시는 즉시 반영한다.                                               |
| SidebarNavigation   | feedback surface·기존 pressed scale                | 선택 surface·label·icon 색상                        | 기본 surface는 disabled > pressed > hover > selected 순서다. 선택 font weight는 즉시 반영한다.                         |
| SettingsLinkRow     | hover·pressed surface                              | 선택 surface·border                                 | surface는 pressed > hover > selected 순서이며, 선택 border는 유지한다. focus outline은 즉시 반영한다.                  |
| ProfileMoreButton   | IconButton의 feedback surface                      | 없음                                                | expanded·busy 의미와 disabled surface·border는 즉시 반영한다.                                                          |
| Tabs                | hover·pressed feedback                             | 기존 underline 이동·label 색상, pill surface·border | 선택 표시와 feedback은 독립이며 focus ring은 즉시 반영한다. pill label 색상은 선택 여부와 무관하게 유지한다.           |
| Checkbox            | hover·pressed feedback                             | checked surface·border                              | checked·mixed 의미와 mark 형태는 즉시 반영한다. 기존 checked·interaction 색상 우선순위를 유지한다.                     |
| RadioOption         | hover·pressed surface                              | 선택 indicator                                      | 선택 indicator와 interaction surface는 독립이며 checked 의미는 즉시 반영한다.                                          |
| SelectTrigger       | 기존 hover surface                                 | 없음                                                | expanded 의미·focus ring·오류 border·disabled 표현은 즉시 반영한다. 새 pressed 표현은 추가하지 않는다.                 |
| SegmentedControl    | hover·pressed feedback                             | 기존 선택 pill 이동                                 | 선택 pill의 60ms 늘림·140ms 정착을 유지한다. label 색상은 선택 여부와 무관하며 선택 의미와 focus ring은 즉시 반영한다. |
| MultiSelectCombobox | 결과 행의 ListboxOption·지우기 IconButton feedback | 결과 행의 ListboxOption 선택 surface·border         | 선택 결과와 token 추가·제거는 즉시 반영하며 별도 layout motion을 추가하지 않는다.                                      |

이 매핑은 Web과 KOSMO가 소유한 iOS·Android presentation에 동일하게 적용한다. 초기 표시, theme 변경,
focus·오류·disabled 표현에는 새 전이를 추가하지 않는다. 빠른 연속 입력은 진행 중인 전이를 대기열에
쌓지 않고 현재 표시에서 최신 상태로 이어진다. reduced-motion이 켜지면 진행 중인 전이도 중지하고
최종 색상·위치를 즉시 반영하며, hover·pressed scale은 제거한다. 접근성 상태와 action·navigation·focus
lifecycle은 이 시각 전이의 완료를 기다리지 않는다.

## 현행 표현 판정과 이관

DSN-18은 현재 구현을 그대로 정본으로 승인하지 않는다. 아래 판정이 DSN-19·21의 migration 입력이며, 후속 구현은 duration·easing·reduced-motion 동작을 다시 결정하지 않는다.

| 현행 유형                      | 현재 source·표현                                                                                                                                                 | 판정      | 목표 계약                                                                                                                                                               | 후속 소유자                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Hover·Pressed                  | `Button`, `IconButton`, `PostActionControl`의 즉시 opacity·pressed 상태                                                                                          | 수정      | 상태 의미는 즉시 반영하고 시각 color·opacity·필요한 scale만 `fast` 120ms + `standard`                                                                                   | DSN-19 shared primitive, DSN-21 domain    |
| Modal·Sheet                    | `ModalSheet`와 여러 overlay의 React Native `Modal` `fade`                                                                                                        | 수정·예외 | KOSMO 소유 overlay는 enter 360ms/exit 200ms. iOS·Android system sheet timing은 OS 예외                                                                                  | DSN-19 shared primitive, DSN-21 call-site |
| Drawer                         | `UniversalShell` mobile drawer의 Web `Modal`과 Native `Drawer`                                                                                                   | 수정·예외 | Web은 enter 360ms/exit 200ms, Native는 현재 구현 예외를 사용                                                                                                            | DSN-21                                    |
| Loading                        | React Native `ActivityIndicator` 기본 동작과 custom spinner가 혼재                                                                                               | 유지·수정 | system indicator는 플랫폼 소유로 유지하고 KOSMO custom spinner만 800ms `linear`에 수렴                                                                                  | DSN-19 shared helper, DSN-21 consumer     |
| Reaction                       | `ReactionPendingSpinner` 820ms linear loop와 즉시 selected·count feedback                                                                                        | 수정      | pending spinner는 800ms `linear`; 별도 300ms 유한 확인 피드백은 적용하지 않음                                                                                           | DSN-19 helper, DSN-21/Product consumer    |
| Reduced motion                 | OS setting adapter와 component별 대체 규칙이 아직 중앙화되지 않음                                                                                                | 수정      | OS setting을 단일 입력으로 사용하고 아래 대체표대로 비필수 이동을 제거                                                                                                  | DSN-19 adapter, DSN-21/Product consumer   |
| PROD-1039 direct app consumers | `PostListItem`, `PostContentWarning`, notification/search recent, profile switchers/picker, composer/media/profile image controls의 Pressable color·opacity 상태 | 수정      | 기존 hover·pressed는 `fast` 120ms, 기존 selected surface는 `standard` 200ms, reduced-motion은 최종값 즉시 반영. content warning hide/unmount는 exit 전이 없이 즉시 처리 | PROD-1039 app domain scope                |

### PROD-1039 direct consumer inventory

아래 표는 이번 이관에서 실제로 기존 상태값이 바뀌던 direct Pressable 소비처만 기록한다. Web은
pointer hover를 가진 경로를, Native는 touch pressed를 표시한다. 두 플랫폼에 모두 존재하는 소비처는
같은 semantic token을 사용하되 플랫폼이 제공하지 않는 상태는 만들지 않는다.

| 소비처 그룹·source                                                                                              | 실제 변경 속성·상태                                                                     | Web                | iOS·Android        | 이관 규칙·제외 근거                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | ------------------ | --------------------------------------------------------------------------------------------------- |
| `PostListItem.tsx`                                                                                              | card `backgroundColor`: `stateHover`, `statePressedSubtle`; `pointerHovered`·`pressed`  | hover + pressed    | pressed            | hover는 pressed 중 억제하고 양방향 `fast` 120ms                                                     |
| `PostContentWarning.tsx`                                                                                        | warning surface `backgroundSurface`·`stateHover`·`statePressed`                         | hover + pressed    | pressed            | 숨김 시 본문·media hide/unmount는 exit 보류 없이 즉시 처리                                          |
| `PostComposer.tsx`, `ComposerMediaEditor.tsx`                                                                   | visibility selected/pressed surface, gallery selected surface, preview/complete opacity | pressed + selected | pressed + selected | interaction `fast` 120ms, selection `standard` 200ms; mobile idle canvas와 gallery 48px target 보존 |
| `ProfilePicker.tsx`, `ProfileSwitcher.tsx`, `ProfileSwitcherTarget.tsx`, `PostComposerProfileSwitcher.tsx`      | option selected/pressed surface, trigger/add/edit opacity                               | hover + pressed    | pressed + selected | selected key와 interaction key를 분리해 selection 해제도 `standard` 200ms                           |
| `ProfileEditImageFields.tsx`, `PostMediaImage.tsx`                                                              | retry opacity `0.7`, image edit veil opacity `0.16`                                     | pressed            | pressed            | 기존 disabled opacity·image geometry는 즉시 유지                                                    |
| `search.tsx`, `NotificationListItemView.tsx`, `PostSourcePresentationView.tsx`                                  | recent/source `stateHover`, notification hover overlay, recent pressed surface          | hover + pressed    | pressed            | pointer hover가 없는 Native에서는 hover 상태를 생성하지 않음                                        |
| `NativeChannelSettings.tsx`, `ProfileSettingsScreen.tsx`, `ProfileMuteAction.tsx`, `PostMediaViewerSurface.tsx` | channel/delete/ack surface, mute action color, viewer status action surface             | hover + pressed    | pressed            | focus·action·accessibility 의미는 전이에 의존하지 않음                                              |

게시글 액션(`PostActionControl`)과 리액션(`ReactionSelector`, `FullReactionPicker`, `ReactionSummary`)도 기존 color·surface·border·opacity에 같은 규칙을 적용한다. hover·pressed는 120ms, selected는 200ms이며, optimistic selected·count와 pending·error 의미는 즉시 유지한다. pending spinner는 기존 800ms linear와 reduced-motion 정적 대체를 유지한다. 별도 성공 확인 애니메이션은 추가하지 않는다.

`ProfileEditHeader`처럼 direct Pressable의 changing visual state가 없고 Button·IconButton이 상태를
소유하는 래퍼는 새 motion을 중복 적용하지 않았다. admin 전용·Storybook 전용 표면도 제품 runtime
소비처 inventory에 포함하지 않는다. 모든 행에서 reduced-motion은 현재 endpoint를 즉시 커밋한다.

### PROD-1043 loading ownership

`LoadingIndicator`는 정상 모드의 `ActivityIndicator`와 reduced-motion의 정적 fallback만 공통화한다. 각 consumer는 기존 accessible name, `busy`, live-region, 실패·성공 의미와 레이아웃을 소유한다. 아래 표에서 Storybook presentation은 표시·name·busy·live-region을 확인하는 분류된 증거이며, Native runtime·실기기·OS timing·VoiceOver·TalkBack 증거로 해석하지 않는다.

| Owner                                  | Normal                                                                                                 | OS reduced-motion                                                                                       | Exception and evidence                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ui/Button`                            | `LoadingIndicator`가 플랫폼 `ActivityIndicator`를 사용하고 Button의 accessible name·`busy`를 유지한다. | 정적 `···`를 표시하고, 지정된 `loadingText`가 있으면 기존 Button label 색·타이포그래피로 함께 표시한다. | Button의 disabled·busy state와 지정된 loading 문구를 유지한다. 접근성 이름만으로 visible copy를 만들지 않는다.                      |
| `ui/ActionMenu`                        | busy item 안에서 플랫폼 indicator를 사용하고 menu item의 label·`busy`를 유지한다.                      | item label 옆에 정적 `···`를 표시하고 busy semantics를 유지한다.                                        | icon slot은 기존 geometry와 hidden semantics를 유지하며 Native sheet enter/exit timing은 ActionMenu의 기존 overlay 계약이 소유한다. |
| `ui/StateView`                         | title을 accessible name으로 가진 플랫폼 indicator를 사용한다.                                          | 기존 title과 함께 정적 `···`를 표시한다.                                                                | 이미 component-local reduced fallback을 소유하므로 shared helper로 일반화하지 않는다.                                               |
| `ui/SidebarNavigation`                 | logout control의 플랫폼 indicator와 label·`busy`를 유지한다.                                           | hidden icon slot 안에서 정적 `···`로 바꾸고 control label·`busy`를 유지한다.                            | compact visual slot과 접근성 숨김 범위를 보존한다.                                                                                  |
| `post/PostActionControl`               | compact action slot의 플랫폼 indicator와 outer action의 name·`busy`를 유지한다.                        | 기존 compact slot에서 정적 `···`를 사용하며 outer action semantics를 유지한다.                          | count·icon geometry와 pending hidden semantics는 기존 Post Action Bar 계약이 소유한다.                                              |
| `post/PostComposerMediaControls`       | 업로드 overlay의 플랫폼 indicator와 기존 이미지 업로드 label을 유지한다.                               | overlay indicator를 정적 `···`로 바꾸고 기존 label을 유지한다.                                          | Composer media overlay와 그 실패·재시도 상태가 consumer 의미를 소유한다.                                                            |
| `post/PostComposerMediaItemsTarget`    | 업로드 tile의 플랫폼 indicator와 기존 이미지 업로드 label을 유지한다.                                  | tile indicator를 정적 `···`로 바꾸고 tile geometry를 유지한다.                                          | gallery scroll은 아래 app-requested scroll 행의 명시적 계약을 따른다.                                                               |
| `post/PostList`                        | next-page 플랫폼 indicator와 기존 live-region 문구를 유지한다.                                         | indicator를 정적 `···`로 바꾸고 기존 live-region 문구를 유지한다.                                       | pagination lifecycle과 list footer geometry는 PostList가 소유한다.                                                                  |
| `pagination/PaginationSurface`         | platform indicator와 `loadingLabel` live-region을 유지한다.                                            | indicator를 정적 `···`로 바꾸고 `loadingLabel` live-region을 유지한다.                                  | pagination sentinel과 loading/error lifecycle은 PaginationSurface가 소유한다.                                                       |
| `follow-request/FollowRequestListItem` | IconButton 안에서 플랫폼 indicator와 outer request action의 name·`busy`를 유지한다.                    | indicator를 정적 `···`로 바꾸고 outer action semantics를 유지한다.                                      | iOS·Android target과 action geometry는 기존 Follow Request row 계약을 따른다.                                                       |
| `profile/ProfileTagMuteAction`         | pending·retry `IconButton`의 플랫폼 indicator와 기존 contextual label·outer `busy` 상태를 유지한다.    | 같은 label의 정적 `···`를 사용하고 outer `busy`·disabled 상태를 유지한다.                               | mute/refetch lifecycle과 IconButton geometry는 consumer가 소유한다.                                                                 |
| `settings/SettingsNavigationList`      | Native notification action의 플랫폼 indicator와 기존 disabled/name 상태를 유지한다.                    | indicator를 정적 `···`로 바꾸고 OS notification flow의 label·disabled 상태를 유지한다.                  | OS permission prompt timing과 결과는 플랫폼 API가 소유한다.                                                                         |
| `Splash`                               | 기존 label을 name으로 가진 플랫폼 indicator와 visible splash label을 유지한다.                         | indicator를 정적 `···`로 바꾸고 기존 visible label을 유지한다.                                          | suspense/bootstrap lifecycle은 Splash consumer가 소유한다.                                                                          |
| `post/PostMediaViewerSurface`          | 기존 viewer status의 platform indicator와 status live-region을 유지한다.                               | 기존 viewer status의 component-local 정적 `···` fallback을 유지한다.                                    | Viewer paging·custom spinner·zoom 규칙은 기존 예외이며 이 helper consumer 일반화 대상이 아니다.                                     |

작은 visual slot을 가진 upload tile과 icon action은 loading 문구로 slot을 밀어내지 않는다. 이 경로의 reduced static dots가 기존 `accessibilityLabel`을 소유하고 outer action의 name·`busy` 또는 parent live-region을 유지한다. Consumer가 이미 표시하는 문구는 그대로 두며, 접근성 이름만으로 visible copy를 추가하지 않는다.

### Navigation·scroll ownership

| Owner                                    | Normal                                                                                                                                                                                 | OS reduced-motion                                                        | Exception and evidence                                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Expo Router framework default navigation | framework default route transition을 사용한다.                                                                                                                                         | 앱이 새로운 navigation animation override를 적용하지 않는다.             | Router default timing은 이 loading 변경의 소유 범위가 아니다. Web/Native runtime에서 별도로 관찰한다.                                     |
| User gesture scroll                      | React Native Web/Native `ScrollView`·list의 user gesture scroll을 사용한다.                                                                                                            | 앱이 gesture scroll timing을 새 duration으로 덮어쓰지 않는다.            | OS·framework gesture behavior는 loading consumer 증거로 대체하지 않는다.                                                                  |
| App-requested viewer scroll              | `PostMediaViewerSurface`의 pager는 `scrollTo(animated: previous.width === width && !reducedMotion)`을 사용하고, iOS `ZoomableImage`는 zoom/reset/scroll에 `!reducedMotion`을 전달한다. | 앱이 요청한 viewer paging·zoom 이동은 `animated: false`로 즉시 처리한다. | Viewer paging/custom spinner는 기존 예외다. 이 행은 앱이 직접 호출하는 scroll의 ownership을 명시한다.                                     |
| App-requested Composer scroll            | `PostComposer` body와 `PostComposerMediaItemsTarget` gallery의 직접 호출은 기존 `animated: false`를 사용한다.                                                                          | 이미 즉시 이동하는 계약을 유지한다.                                      | Composer focus/keyboard 보정과 media gallery geometry를 보존하며 새 animation override를 추가하지 않는다.                                 |
| Web query/navigation scroll restore      | `UniversalShell`, `PrimaryNavigationScrollContext`, search query restore의 `window.scrollTo({ behavior: 'auto' })`를 사용한다.                                                         | 기존 `auto` restore를 유지한다.                                          | 앱이 직접 요청한 restore는 앱이 소유하지만 user gesture/framework default와 섞지 않는다.                                                  |
| PROD-952 Native shell drawer             | `react-native-drawer-layout@4.2.10`의 built-in spring을 사용한다.                                                                                                                      | 현재 built-in spring이 실행될 수 있다.                                   | Native shell drawer에만 적용되는 기존 PROD-952 예외다. 별도 결정·실기기 검증 범위이며 일반 reduced-motion loading 계약을 완화하지 않는다. |

Loading 변경은 위 navigation·scroll 소유권과 timing을 바꾸지 않는다.

## Reduced motion

프로덕션 계약은 Web의 `prefers-reduced-motion`과 Android·iOS의 OS reduced-motion 설정만 입력으로 사용한다. `ThemeProvider`가 React Native `AccessibilityInfo`를 단일 입력 adapter로 제공하며, Storybook의 override는 검증 전용이다. 앱 내부 사용자 설정은 이번 범위에서 제공하지 않고, 장기 후속은 [PROD-745](https://linear.app/byulmaru/issue/PROD-745/kosmo-앱-내-motion-축소-사용자-설정-지원)가 소유한다.

`ThemeProvider`는 최초 OS 설정 확인 전까지 reduced-motion을 유지한다. 현재 OS 입력에서 관찰한 최신 변경은 늦게 도착한 초기 조회보다 우선하며, 구독 해제 뒤 도착한 초기 조회 응답은 현재 preference를 갱신하지 않는다. 명시적 Storybook override의 `true`·`false` 값은 OS 입력을 사용하지 않으며, override를 해제하면 OS 설정을 다시 따른다.

| 일반 표현                | OS reduced-motion에서의 대체                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| hover·pressed scale      | scale 제거, color·opacity 상태는 즉시 반영                                 |
| selected indicator 이동  | 최종 위치·surface·border를 즉시 반영                                       |
| modal·drawer slide·scale | 이동 제거, 최종 surface와 scrim을 즉시 표시※                               |
| toast translate·fade     | 최종 toast를 즉시 표시·제거, 체류시간은 유지                               |
| reaction scale·ripple    | 즉시 color·count·selected 상태로 대체; 별도 유한 확인 전이는 추가하지 않음 |
| spinner rotation loop    | spinner를 숨기고 정적 `···`를 표시하며 기존 consumer 문구는 유지           |
| skeleton                 | 정적 placeholder 유지                                                      |

※ 현재 Native shell drawer의 built-in spring 예외는 아래 PROD-952 Native drawer 규칙을 따른다.

motion을 제거해도 focus, loading, success, error, selected와 announcement 의미는 제거하지 않는다.

## 플랫폼과 예외

- Web과 KOSMO가 직접 소유한 Native primitive는 위 semantic 역할을 사용한다.
- iOS system sheet와 Android system bottom sheet처럼 OS presentation API가 소유한 timing·curve는 플랫폼 예외로 유지한다. 임의의 ms 값으로 덮어쓰지 않는다.
- 위 판정표에 없는 route·shell·domain local motion은 DSN-21/Product가 같은 형식으로 소비처, 목표 token, 플랫폼 예외와 검증 evidence를 기록한다. 새 motion 역할을 임의로 만들지 않는다.
- PROD-750은 기존 route·shell·domain consumer의 scrim·elevation을 공용 foundation으로 이관한다. Web `UniversalShell` drawer와 기존 React Native `Modal` fade는 exit 동안 mount를 유지하는 consumer lifecycle 변경 없이 `useOverlayMotion`으로 치환할 수 없으므로, focus restore·dirty confirmation·gesture·Android back 계약을 보존하는 현행 예외로 기록한다. 이 예외의 해소는 해당 lifecycle을 함께 검증하는 후속 범위에서 수행한다.
- [PROD-952](https://linear.app/byulmaru/issue/PROD-952)는 현재 Native shell drawer(`NativeNavigationDrawer`, `apps/app/src/components/shell/ShellNavigationDrawer.tsx`)가 `react-native-drawer-layout@4.2.10`의 built-in spring presentation을 사용하는 구현 예외를 기록한다. 확인한 `react-native-drawer-layout@4.2.10` 공개 API에는 OS reduced-motion 설정에 따른 motion timing·disable 제어가 없으므로, OS reduced-motion이 켜져도 해당 spring이 실행될 수 있다. 이 예외는 현재 Native shell drawer 경로에만 적용하며, Web과 KOSMO가 직접 소유한 primitive의 일반 reduced-motion 계약과 focus·dismiss·접근성 의미는 완화하지 않는다. library 또는 upstream 동작 변경은 이 이슈의 완료 조건이 아니며, 추후 별도 결정·검증 범위에서 다룬다. 이 기록은 reduced-motion에서 spring 제거를 보장하지 않는 현재 동작의 범위만 정하며, Native 기능·접근성·실기기 검증의 면제를 의미하지 않는다.
- 기존 Reaction spinner `820ms`는 `loading-cycle` `800ms`로 수렴한다. 제품 근거 없이 `820ms` 예외를 새로 만들지 않는다.
- 새 duration·easing을 raw 값으로 추가하지 않는다. spinner는 `motion/easing/linear`를 사용한다. 현재 token으로 표현할 수 없으면 component, platform, reduced-motion 대체와 검증 evidence를 함께 제시해 Design owner 승인을 받는다.

## Figma와 구현 경계

- DSN-18: 이 문서, `KOSMO Motion` variable과 대표 Figma Motion timeline을 정본으로 고정한다.
- DSN-19: shared motion token과 OS preference adapter를 구현하고, Button 상태 전환·ModalSheet·ActionMenu enter/exit·Reaction 800ms spinner·reduced-motion 정적 loading 대체에 적용한다. React Native system indicator는 위 플랫폼 예외를 유지한다.
- DSN-21 또는 연결된 Product 이슈: route, shell, domain consumer와 예외를 이관·검증한다.
- DSN-13: 구현 확정 후 기존 Components/Screens에 같은 계약을 적용하고 최종 Figma evidence를 남긴다.

DSN-18에서는 기존 Components/Screens의 motion을 일괄 재작성하지 않는다. 대표 예시는 Figma Motion의 manual keyframe track과 2.4초 timeline으로 재생하며, 화면 간 이동을 위한 Prototype reaction·flow와는 별개다. 2.4초는 800ms spinner cycle의 정수 배수라 loop 경계에서 멈춤이나 회전 점프가 생기지 않는다. 이 타임라인은 계약을 재생하고 비교하기 위한 canonical example이며 제품 화면 동기화 완료 증거가 아니다.
