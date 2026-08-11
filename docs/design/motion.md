# Motion·transition·reduced-motion 규칙

이 문서는 DSN-18에서 확정한 KOSMO의 motion 계약이다. 시각 정본은 Figma [`04 Motion · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1772-890), 재생 가능한 대표 예시는 [`KOSMO Motion Playground · Production`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=1774-880)이다.

finite transition, 반복 loading cycle, toast 체류시간과 focus scheduling은 서로 다른 개념으로 관리한다. 하나의 duration을 모든 motion에 재사용하지 않는다.

## Motion token

Figma의 active collection은 `KOSMO Motion`이며 단일 `Value` mode를 사용한다. duration 값의 단위는 ms다.

| Token                           |                 값 | 역할                                  |
| ------------------------------- | -----------------: | ------------------------------------- |
| `motion/duration/instant`       |                0ms | 애니메이션 없는 즉시 상태 전환        |
| `motion/duration/fast`          |              120ms | hover·pressed·짧은 exit               |
| `motion/duration/standard`      |              200ms | selected·toast·일반 상태 전환         |
| `motion/duration/emphasized`    |              360ms | modal·drawer의 공간 변화가 있는 enter |
| `motion/duration/reaction`      |              300ms | like·reaction의 유한한 확인 피드백    |
| `motion/duration/loading-cycle` |              800ms | indeterminate spinner 한 바퀴         |
| `motion/easing/standard`        | `.17, .73, .14, 1` | 일반 상태 전환                        |
| `motion/easing/enter`           |    `.16, 1, .3, 1` | 빠르게 나타나 안정적으로 정착         |
| `motion/easing/exit`            |      `.4, 0, 1, 1` | 주의를 끌지 않고 빠르게 퇴장          |
| `motion/easing/linear`          |           `linear` | indeterminate spinner의 일정한 회전   |

`motion/duration/loading-cycle`은 finite transition에 사용하지 않는다. Toast의 기본 체류시간 `3000ms`도 motion token이 아니라 제품 lifecycle 값이다.

## Component 사용표

| 역할               | Duration                 | Easing     | 표현                                    |
| ------------------ | ------------------------ | ---------- | --------------------------------------- |
| Hover·Pressed      | `fast` 120ms             | standard   | color·opacity, 필요한 경우 scale `0.98` |
| Selected           | `standard` 200ms         | standard   | indicator 위치, surface·border·color    |
| Modal·Drawer enter | `emphasized` 360ms       | enter      | scrim fade와 짧은 position·opacity 변화 |
| Modal·Drawer exit  | `standard` 200ms         | exit       | position·opacity를 함께 정리            |
| Toast              | enter 200ms / exit 120ms | enter/exit | translate·opacity, 체류시간은 별도      |
| Reaction           | `reaction` 300ms         | standard   | 유한한 scale·color 확인 피드백          |
| Spinner            | `loading-cycle` 800ms    | linear     | rotation만 반복                         |
| Skeleton           | `instant` 0ms            | 없음       | 정적 placeholder                        |

상태의 의미와 accessible state는 motion 완료를 기다리지 않고 즉시 갱신한다. focus 이동·복원과 `requestAnimationFrame` scheduling은 시각 transition으로 분류하지 않는다.

## 현행 표현 판정과 이관

DSN-18은 현재 구현을 그대로 정본으로 승인하지 않는다. 아래 판정이 DSN-19·21의 migration 입력이며, 후속 구현은 duration·easing·reduced-motion 동작을 다시 결정하지 않는다.

| 현행 유형      | 현재 source·표현                                                          | 판정      | 목표 계약                                                                              | 후속 소유자                               |
| -------------- | ------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| Hover·Pressed  | `Button`, `IconButton`, `PostActionControl`의 즉시 opacity·pressed 상태   | 수정      | 상태 의미는 즉시 반영하고 시각 color·opacity·필요한 scale만 `fast` 120ms + `standard`  | DSN-19 shared primitive, DSN-21 domain    |
| Modal·Sheet    | `ModalSheet`와 여러 overlay의 React Native `Modal` `fade`                 | 수정·예외 | KOSMO 소유 overlay는 enter 360ms/exit 200ms. iOS·Android system sheet timing은 OS 예외 | DSN-19 shared primitive, DSN-21 call-site |
| Drawer         | `UniversalShell` mobile drawer의 `animationType="none"`                   | 수정      | scrim과 짧은 position·opacity를 enter 360ms/exit 200ms로 설명                          | DSN-21                                    |
| Loading        | React Native `ActivityIndicator` 기본 동작과 custom spinner가 혼재        | 유지·수정 | system indicator는 플랫폼 소유로 유지하고 KOSMO custom spinner만 800ms `linear`에 수렴 | DSN-19 shared helper, DSN-21 consumer     |
| Reaction       | `ReactionPendingSpinner` 820ms linear loop와 즉시 selected·count feedback | 수정      | pending spinner는 800ms `linear`, 유한 reaction feedback은 300ms `standard`            | DSN-19 helper, DSN-21/Product consumer    |
| Reduced motion | OS setting adapter와 component별 대체 규칙이 아직 중앙화되지 않음         | 수정      | OS setting을 단일 입력으로 사용하고 아래 대체표대로 비필수 이동을 제거                 | DSN-19 adapter, DSN-21/Product consumer   |

## Reduced motion

프로덕션 계약은 Web의 `prefers-reduced-motion`과 Android·iOS의 OS reduced-motion 설정만 입력으로 사용한다. `ThemeProvider`가 React Native `AccessibilityInfo`를 단일 입력 adapter로 제공하며, Storybook의 override는 검증 전용이다. 앱 내부 사용자 설정은 이번 범위에서 제공하지 않고, 장기 후속은 [PROD-745](https://linear.app/byulmaru/issue/PROD-745/kosmo-앱-내-motion-축소-사용자-설정-지원)가 소유한다.

| 일반 표현                | OS reduced-motion에서의 대체                      |
| ------------------------ | ------------------------------------------------- |
| hover·pressed scale      | scale 제거, color·opacity 상태는 즉시 반영        |
| selected indicator 이동  | 최종 위치·surface·border를 즉시 반영              |
| modal·drawer slide·scale | 이동 제거, 최종 surface와 scrim을 즉시 표시       |
| toast translate·fade     | 최종 toast를 즉시 표시·제거, 체류시간은 유지      |
| reaction scale·ripple    | 즉시 color·count·selected 상태로 대체             |
| spinner rotation loop    | spinner를 숨기고 정적 `···`와 loading 문구를 표시 |
| skeleton                 | 정적 placeholder 유지                             |

motion을 제거해도 focus, loading, success, error, selected와 announcement 의미는 제거하지 않는다.

## 플랫폼과 예외

- Web과 KOSMO가 직접 소유한 Native primitive는 위 semantic 역할을 사용한다.
- iOS system sheet와 Android system bottom sheet처럼 OS presentation API가 소유한 timing·curve는 플랫폼 예외로 유지한다. 임의의 ms 값으로 덮어쓰지 않는다.
- 위 판정표에 없는 route·shell·domain local motion은 DSN-21/Product가 같은 형식으로 소비처, 목표 token, 플랫폼 예외와 검증 evidence를 기록한다. 새 motion 역할을 임의로 만들지 않는다.
- 기존 Reaction spinner `820ms`는 `loading-cycle` `800ms`로 수렴한다. 제품 근거 없이 `820ms` 예외를 새로 만들지 않는다.
- 새 duration·easing을 raw 값으로 추가하지 않는다. spinner는 `motion/easing/linear`를 사용한다. 현재 token으로 표현할 수 없으면 component, platform, reduced-motion 대체와 검증 evidence를 함께 제시해 Design owner 승인을 받는다.

## Figma와 구현 경계

- DSN-18: 이 문서, `KOSMO Motion` variable과 대표 Figma Motion timeline을 정본으로 고정한다.
- DSN-19: shared motion token과 OS preference adapter를 구현하고, Button 상태 전환·ModalSheet·ActionMenu enter/exit·Reaction 800ms spinner·reduced-motion 정적 loading 대체에 적용한다. React Native system indicator는 위 플랫폼 예외를 유지한다.
- DSN-21 또는 연결된 Product 이슈: route, shell, domain consumer와 예외를 이관·검증한다.
- DSN-13: 구현 확정 후 기존 Components/Screens에 같은 계약을 적용하고 최종 Figma evidence를 남긴다.

DSN-18에서는 기존 Components/Screens의 motion을 일괄 재작성하지 않는다. 대표 예시는 Figma Motion의 manual keyframe track과 2.4초 timeline으로 재생하며, 화면 간 이동을 위한 Prototype reaction·flow와는 별개다. 2.4초는 800ms spinner cycle의 정수 배수라 loop 경계에서 멈춤이나 회전 점프가 생기지 않는다. 이 타임라인은 계약을 재생하고 비교하기 위한 canonical example이며 제품 화면 동기화 완료 증거가 아니다.
