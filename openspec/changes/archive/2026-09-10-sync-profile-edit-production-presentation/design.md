## Context

Production `/profile-edit`와 `KOSMO/Screens/Profile Edit/Catalog`는 이미 같은 controlled `ProfileEditScreen`·`ProfileEditForm`·`ProfileEditImageFields`를 사용한다. 현재 구현은 `64px` header, `44px` back target, `24px` icon과 responsive avatar를 제공하지만 Figma 재대조에서 title role, side-slot 대칭, field support spacing과 semantic color가 어긋난 부분을 확인했다.

공용 `PageHeader`, `TextField`, `Avatar`의 전역 redesign은 DSN-45에서 제외됐다. route는 Relay query/mutation, selected Profile 권한, field별 Media upload, draft 보존과 navigation guard를 소유하므로 presentation 이관이 이 lifecycle을 옮기거나 복제해서는 안 된다. PROD-531이 아직 완료되지 않아 Follow Approval Switch는 현재 Profile draft에 남는다.

## Goals / Non-Goals

**Goals**

- 기존 Profile Edit presentation을 DSN-45·PROD-941의 header, typography, spacing과 responsive image geometry에 맞춘다.
- 공용 primitive와 현재 controlled state·접근성 경계를 유지한다.
- Mobile `390`, Compact `1024`, Full `1440`의 Light/Dark와 기존 validation·saving·image 상태를 실행 가능한 Storybook 계약으로 남긴다.
- canonical design 문서와 `profile-edit-ui` 계약을 실제 Production 상태에 맞춘다.

**Non-Goals**

- Profile 추가 정보, avatar/header crop·pan/zoom·alt text 또는 새 field를 구현하지 않는다.
- Follow Approval을 Settings로 이전하거나 Profile Edit에서 제거하지 않는다.
- GraphQL/API/DB, Relay, Media upload, authorization, navigation 또는 persistence를 변경하지 않는다.
- 공용 `PageHeader`, `TextField`, `Avatar`, `Switch`를 전역 redesign하지 않는다.

## Implementation Guidance

### Current Constraints

- `ProfileEditScreen` header는 전체 surface 안의 중앙 제목과 trailing 저장 action을 함께 배치하는 전용 chrome이다. 일반 `PageHeader`의 text variant는 leading 다음의 가용 폭에 제목을 배치하며 exact `64px` 고정 높이를 소유하지 않는다. Profile Edit title은 `UI/Heading/M` `24/27.6/700`이며 `64px` side slot 안에서 좌우 `80px` 경계를 유지한다.
- `ProfileEditImageFields`는 header/avatar preview 전체를 하나의 ActionMenu trigger 또는 직접 picker button으로 사용한다. camera와 avatar 내부 표현은 별도 focus target이 되면 안 된다.
- `ProfileHero`는 Relay fragment, 공개 Profile identity·count·relationship action을 포함하는 읽기 전용 consumer지만 Mobile/Center avatar geometry는 이미 같은 breakpoint와 크기를 구현한다.
- 공용 `TextField` 내부 label은 `Label/M`과 `4px` support stack을 사용한다. Profile Edit의 외부 label은 `Label/L`이며 displayName·bio label-control과 control-counter는 `8px`, Profile Tag root는 `12px`, chip/input row와 removable chip 좌측 inset은 `8px`로 전용 composition에서 조정한다. Profile Edit만을 위해 공용 TextField를 전역 변경하면 다른 form consumer의 visual contract가 바뀐다.
- Web Storybook은 Native의 실제 touch, safe area, keyboard, Back과 focus lifecycle 완료 증거가 아니다.

### Recommended Approach

- `ProfileEditScreen`의 전용 header composition과 Web sticky 동작을 유지한다. deprecated alias 대신 기존 `space`, `iconSizes`, `textStyles`를 사용해 header `64`, horizontal inset `16`, back layout target `44`, `ArrowLeft` `24`, title `uiHeadingM`, symmetric `64px` side slot, Web 저장 action `64×40`을 적용한다. `IconButton`과 `Button`의 기존 platform 보정으로 Android/iOS 최소 입력 target을 유지한다.
- `ProfileEditImageFields`가 기존처럼 aspect·overlap·camera veil과 edit lifecycle을 소유하게 한다. `useWindowDimensions`, `breakpoints.compact`와 현재 `ProfileHero`의 값으로 Mobile `96/88/48/64`, Compact·Full `128/120/64/80`의 frame/content/overlap/row geometry를 적용하고 header 이미지와 아래 surface 경계에는 `border/default` 1px 하단선을 둔다. 별도 공용 geometry helper는 만들지 않는다.
- avatar content는 removed/empty semantics를 보존하기 위해 기존 raw `Image`/placeholder를 단일 preview button 안에서 유지한다. header preview의 raw `Image`, ActionMenu와 field별 status/retry도 유지하며, single button·접근성 subtree·content geometry 계약은 동일하게 보존한다.
- `ProfileEditForm`은 displayName·bio label을 외부 `Text`로 합성하고 `TextField`·`TextArea`에는 기존 accessibility label과 error를 전달한다. 외부 label-control은 `8px`, control-counter는 `8px`, field section은 `16px`를 유지한다. `ProfileTagEditor` root는 `12px`, chip/input row와 removable chip 좌측 inset은 `8px`로 맞춘다. 입력 value는 enabled 상태에서 UI `16/24` `foreground/muted`, counter는 `12/16`을 사용하며 disabled 상태는 공용 TextField의 `state/disabled/foreground`를 보존한다.
- header/screen과 image/avatar field는 Figma semantic role인 `background/canvas`, `background/surface`, `action/primary/subtle`, `border/default`, `foreground/primary`, `foreground/muted`, `overlay/scrim`, `fixed/white`를 사용한다. `overlay/scrim`에 추가 opacity를 곱하지 않는다.
- 기존 Profile Edit story fixture와 production component를 재사용한다. 영향을 받는 responsive geometry 검증은 `*.tests.stories.tsx`의 Controls-disabled story로 두고 대표 visual story는 `globals.viewport`와 Light/Dark 상태를 명시한다. 기존 save, validation, retry와 image draft 검증은 중복 작성하지 않고 회귀로 실행한다.
- `docs/design/profile-edit.md`의 “Product 이관 전” 표현과 current inventory를 실제 반영 상태로 갱신하고 OpenSpec task에 Web/Native 실행·미실행 증거를 구분해 기록한다.

### Allowed Alternatives

- As-built: avatar의 removed/empty semantics를 보존하기 위해 공용 `Avatar` 대신 기존 raw `Image`·placeholder를 유지했다. frame/content 크기, single-button 접근성 tree와 Light/Dark 표현은 동일하다.
- component test가 더 안정적으로 같은 실행 결과를 증명하면 responsive Storybook play assertion과 작은 React Native unit test 사이에서 검증 위치를 조정할 수 있다. source text·정규식 검사는 사용할 수 없다.

### Known Traps

- `ProfileEditScreen`을 `PageHeader`로 통째로 교체하면 제목 정렬·exact height와 저장 action geometry가 달라지고 공용 header 범위까지 확장된다.
- `ProfileEditImageFields`를 `ProfileHero`로 교체하면 Relay와 공개 Profile 동작이 편집 presentation에 유입된다.
- 공용 `TextField` label token이나 global layout recipe를 바꾸면 다른 화면이 함께 변한다.
- Figma에서 제거된 Follow Approval을 PROD-531 완료 전에 제거하면 조회·draft·save 계약이 끊긴다.
- avatar 내부 `Avatar` image role이나 camera icon을 그대로 노출하면 button 안에 중복 접근성 대상이 생긴다.
- direct iframe 폭만 바꾸거나 viewport 이름만 설정하지 않은 Storybook 검증은 실제 `390/1024/1440` layout을 증명하지 않는다.
- Web Storybook 결과를 Android/iOS safe area, keyboard, Back, focus와 실제 target 완료로 일반화하지 않는다.

## Risks

- 고정 `64px` header에서 큰 font scaling이 제목과 actions를 겹치게 할 수 있다. 좁은 폭과 확대 상태에서 action target과 제목 reflow를 확인한다.
- viewport 기반 avatar 분기는 Native와 Web container가 다른 경우 예상과 다를 수 있다. 지원 폭별 render 결과를 확인하고 실제 Native runtime을 실행하지 못하면 명시적으로 미검증으로 남긴다.
- UI-only 변경이므로 rollback은 해당 presentation·story·문서 delta를 되돌리며 route/API/data migration은 필요 없다.
