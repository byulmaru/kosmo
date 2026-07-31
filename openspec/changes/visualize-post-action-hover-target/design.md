## Context

`PostActionControl`은 Reply, Repost, Reaction, Bookmark와 More가 공유하는 `Pressable` leaf이며 28px 높이,
50px 또는 28px 너비, active·pressed·blocked 표현을 소유한다. 최초 PROD-595 구현은 Web hover 시 Pressable
전체에 `surface`와 full radius를 적용했다. 시각 검토 뒤 click target 표시는 유지할 필요가 없고 glyph
중심의 28×28 원형 affordance가 더 적합하다는 제품 결정으로 계약이 수정됐다.

Theme에는 light·dark `surface` token이 있지만 현재 `ThemeProvider`는 production과 Storybook 모두 light
theme만 공급한다. PROD-595에서는 theme provider나 app-wide dark 전환을 추가하지 않고 현재 도달 가능한
light Web 동작을 검증한다. dark runtime 관찰은 미검증으로 남긴다.

## Goals / Non-Goals

**Goals:**

- 공통 Post Action control의 glyph 중심에 28×28 Web 비터치 hover background를 표시한다.
- 기존 active·pressed·blocked 상태와 28px geometry를 보존한다.
- 일반 action은 `surface`를 사용한다. Reaction hover는 30% `like` background와 불투명 `like` heart
  foreground를 함께 사용하고 selected heart는 기존 불투명 `like`를 유지한다.
- 가장 가까운 Storybook interaction에서 hover와 핵심 회귀 위험을 직접 검증한다.

**Non-Goals:**

- action 기능, count, mutation, 실행 eligibility와 Relay cache 변경
- target 크기, Action Bar 배치와 Native touch target 정책 변경
- Reply·Repost·Bookmark·More의 action별 semantic tint 또는 새 색상 token 추가
- production·Storybook dark theme 선택 기반 추가와 dark runtime 완료 주장

## Implementation Guidance

### Current Constraints

- hover 상태와 28×28 visual layer는 공통 `PostActionControl` 경계에서 처리하되 Reaction만 기존 `like`
  background color·opacity와 hover foreground color를 주입한다.
- `Pressable` style callback의 React Native TypeScript 계약은 `pressed`만 제공하므로 React Native Web의
  추가 `hovered` field에 의존하면 공통 type을 우회하게 된다.
- raw pointer enter는 touch pointer도 포함할 수 있다. React Native Web의 hover abstraction을 사용해 touch
  입력이 hover로 분류되지 않게 해야 한다.
- disabled control은 새 hover 상태가 기존 blocked 표현을 덮지 않아야 하며, hover 중 blocked로 바뀌어도
  background가 남지 않아야 한다.

### Recommended Approach

공통 control에서 Web일 때만 `onHoverIn`·`onHoverOut`으로 local hover state를 갱신한다. `hovered &&
!blocked`일 때 16×16 icon layout box 뒤에 absolute 28×28 원형 visual layer를 렌더링한다. 일반 action은
기본 `surface`를 사용하고 Reaction은 30% opacity의 `like` background와 불투명 `like` hover foreground를
전달한다. active color도 기본 `primary`를 유지하되 Reaction만 불투명 `like`를 전달한다. 기존
`blocked > pressed` opacity 우선순위와 Pressable width·height·spacing은 유지한다.

기존 Post Action Bar Storybook의 Web hover interaction을 수정해 50×28 click target 안의 28×28 icon circle,
28×28 More, Reaction 30% `like` background·불투명 `like` foreground·selected 표현, pressed 보존, blocked
미표시와 geometry 불변을 검증한다.
Theme provider는 변경하지 않고 light Web에서만 실행한다.

### Allowed Alternatives

`pointerType`에서 touch를 명시적으로 제외하는 Web pointer handler도 specs를 만족하면 허용한다. 다만 현재
React Native Web이 제공하는 hover abstraction보다 입력 분기 책임이 늘어나므로 기본 경로로 사용하지 않는다.

### Known Traps

- `primaryHover`는 Reaction selector에서 selected·pressed 의미로 사용하므로 Action Bar Reaction에 재사용하지 않는다.
- 28×28 visual layer를 새 hit target으로 만들거나 pointer event를 받게 하지 않는다.
- background를 위해 icon layout box, padding·width·height를 늘려 icon-count 간격을 바꾸지 않는다.
- blocked action의 pointer 이동, Web touch 입력 또는 Native render를 hover 완료 증거로 오판하지 않는다.

## Risks / Trade-offs

- [local hover state가 blocked 전환 뒤 남을 수 있음] → style 단계에서 `!blocked`를 함께 검사한다.
- [Storybook browser event가 실제 touch suppression을 모두 증명하지 못함] → light Web pointer 동작만 자동화
  증거로 삼고 Web touch·Native와 dark runtime은 별도 미검증 항목으로 보고한다.
- [dark theme 요구사항을 runtime에서 확인하지 못함] → 고정 색상 없이 semantic `surface`와 `like`만 사용하고 완료
  보고에서 dark runtime 검증을 주장하지 않는다.

## Migration Plan

DB·API migration은 없다. hover style과 Storybook 검증을 같은 PR에 배포하며 문제가 있으면 해당 UI 변경만
되돌린다.

## Open Questions

없음.
