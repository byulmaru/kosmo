# KOSMO Figma 감사 규칙

이 문서는 검사 체크리스트다. authority는 `SKILL.md`의 대상별 계약과 foundation token 기준을 구분해 적용한다.

## 판정과 우선순위

- `확정`: Figma 구조, 값, binding 또는 screenshot으로 직접 증명됨.
- `위험`: 정황은 있으나 의도, mode, consumer 영향 또는 runtime 확인이 더 필요함.
- `검증 공백`: 현재 증거로 판정할 수 없음. 결함으로 부풀리지 않음.
- `P1`: 콘텐츠 손실, 조작 불가, 중대한 접근성·테마 파손.
- `P2`: source 계약 또는 반복 사용에서 실제 결함을 만들 가능성이 큼.
- `P3`: 일관성·유지보수·polish 문제. 단독으로 긴급 수정을 요구하지 않음.

raw·primitive·legacy binding 위반은 기본 `P2`다. 필수 theme에서 실제 콘텐츠·조작 파손이 확인된 경우에만 `P1`로 올린다.

## 1. Source와 재사용

- 반복 UI는 기존 source component와 component property를 우선한다.
- instance가 source 문제를 override로 가리거나 detached되었는지 확인한다.
- source 수정은 영향받는 instance와 의도된 override를 먼저 열거한다.
- 비슷해 보여도 제품 동작·정보 구조가 다르면 억지로 합치지 않는다.
- source cleanup과 consumer의 fetch, navigation, modal lifecycle은 분리한다.

자동 확인 후보: node type, main component, component properties, variant properties, override 존재, 동일 이름·유사 구조 반복.

## 2. Token과 binding

- 새 UI의 색은 `KOSMO Semantic Color`만 직접 사용한다. raw hex와 primitive·legacy 직접 binding을 찾는다.
- spacing, radius, border는 감사 시점의 기준 브랜치에 머지된 `docs/design/foundations.md`와 canonical token 정의에서 읽는다. 이 스킬에 값 목록을 복제하지 않는다.
- 현재 worktree가 기준 브랜치와 다르면 기준 브랜치 계약과 worktree·후보 변경을 분리한다. merge 여부나 revision을 확인하지 못하면 token-scale 통과·위반을 확정하지 않는다.
- 사용자가 미병합 PR·제안을 명시적으로 선택하면 그 값을 `후보 계약`으로 표시한다. 현재 계약 위반과 후보 계약으로의 migration gap을 서로 다른 finding으로 보고한다.
- 후보 계약이 머지되면 갱신된 canonical 문서와 token 정의를 사용한다. PR 번호나 과도기 값을 이 스킬에 고정하지 않는다.
- typography는 숫자 조합보다 역할을 먼저 확인한다. 동일 역할의 raw font 값과 unbound text style을 찾는다.
- motion은 semantic motion token을 사용하고 raw duration·easing을 찾는다.
- mode-specific 값을 고정한 binding이나 Light만 존재하는 semantic variable을 확인한다.

raw 값 자체만으로 대체 token을 추측하지 않는다. 기존 semantic role을 찾지 못하면 `수정 전 결정`으로 남긴다.

## 3. Layout과 geometry

- 구조적으로 흐르는 콘텐츠가 manual x/y에 의존하는지 확인한다. 긴 텍스트에서 overlap·clip 가능성이 있으면 대표 문자열로 검증한다.
- Auto Layout의 direction, padding, gap, alignment, wrap, Hug/Fill/Fixed가 콘텐츠 계약과 맞는지 확인한다.
- clipContent, fixed height, absolute position, negative spacing이 focus ring·텍스트·badge를 자르는지 확인한다.
- icon의 시각 크기와 interactive target 크기를 혼동하지 않는다.
- screenshot의 optical alignment와 구조상 alignment를 분리한다.

### 중첩 모서리 반경

`outer radius = inner radius + inset`은 다음 조건을 모두 만족할 때만 적용한다.

1. parent와 child가 모두 보이는 rounded surface다.
2. child 윤곽이 parent 윤곽을 일정한 inset으로 따라가도록 의도됐다.
3. 해당 corner의 실제 inset이 균일하다.
4. corner smoothing, mask, 비대칭 padding 또는 optical correction이 없다.

예: parent와 child의 실제 painted contour inset이 `12`이고 inner radius가 `8`이면 outer 후보는 `20`이다. padding 값만으로 inset을 확정하지 않으며 stroke alignment·weight를 포함해 측정한다.

다음에는 적용하지 않는다: 카드 안의 독립 Button, 관련 없는 descendant, pill·circle, 투명 hit-area wrapper, 한쪽 corner만 맞닿는 구성, asymmetric padding, squircle/corner smoothing, 의도된 optical correction. 숫자만 보고 자동 수정하지 말고 x/y·크기·corner별 inset과 screenshot을 함께 확인한다.

## 4. Typography와 content resilience

- UI는 SUIT, 본문·읽기 콘텐츠는 Pretendard 역할 계약을 우선한다. Figma MCP preview 대체 폰트는 실제 token geometry를 바꾸는 근거가 아니다.
- 12px는 역할 확인 신호다. canonical role이 본문·주요 정보·핵심 action으로 확인될 때만 finding으로 판정한다.
- line height, weight, truncation, max lines, textAutoResize가 역할과 맞는지 확인한다.
- 긴 한국어, 영어 확장, 숫자·날짜, 빈 값, 오류 문구에서 overlap·잘림·위계 붕괴를 확인한다.
- RTL은 제품 지원 범위가 확인된 경우에만 합격 조건으로 강제하고, 아니면 검증 공백으로 기록한다.

## 5. State와 variant

- interaction 주체별로 default, hover, pressed, focus, selected, disabled, loading, error, empty, success 중 실제로 필요한 상태를 확인한다.
- container가 비상호작용이면 내부 Button 상태를 container에 복제하지 않는다.
- focus와 selected를 같은 상태로 취급하지 않는다.
- disabled·loading에서 label, affordance, contrast, pointer/keyboard 동작 계약이 함께 있는지 확인한다.
- state 누락과 단순히 현재 감사 범위에 state 증거가 없는 경우를 구분한다.

## 6. Color, theme, elevation

- primitive → semantic Light/Dark → component mapping을 확인한다.
- surface, foreground, border, accent, destructive, focus 역할이 의미와 맞는지 확인한다.
- selected와 focus, scrim과 surface elevation을 서로 대신 쓰지 않는다.
- solid foreground/background를 해석할 수 있으면 대비를 계산할 수 있지만 `대비 후보`로 보고한다. opacity, image, gradient, blend가 있으면 screenshot과 runtime 검증을 남긴다.
- 일반 텍스트 4.5:1, 큰 텍스트·focus·control boundary 3:1은 검사 기준이며 Figma 감사만으로 WCAG 전체 준수를 선언하지 않는다.

## 7. Accessibility

- 의미 있는 control의 role, accessible name, state 표현이 디자인 계약에 있는지 확인한다.
- Web target baseline은 24 CSS px, KOSMO Web IconButton은 32px, iOS는 44pt, Android는 48dp 계약과 비교한다.
- 인접 target 간격과 focus ring clipping을 geometry로 점검한다.
- color-only, icon-only, hover-only 전달을 찾는다.
- keyboard order·activation, focus-visible, screen reader announcement, VoiceOver·TalkBack, 실제 hitSlop은 runtime 검증으로 남긴다.

## 8. Responsive, platform, motion

- Web compact `<768`, 기본 `>=768`, full canvas `>=1280` 계약과 Native mobile shell을 섞지 않는다.
- fixed width/height, min/max, wrap, safe area, keyboard avoidance, zoom·reflow 위험을 확인한다.
- 같은 디자인이라도 Web과 iOS·Android target, focus, hover, system inset 증거를 분리한다.
- motion이 있으면 enter/exit, spatial relation, interruption, reduced-motion 대체를 확인한다. motion이 없는데 state 이름만으로 animation을 요구하지 않는다.

## 9. 제품 품질 렌즈

OpenAI Product Design audit framework의 다음 렌즈를 구조 검사 뒤에 적용한다: discoverability, information architecture, friction, hierarchy/clarity, trust, default/empty states, copy/CTA, consistency. 구조적 결함과 polish 제안을 분리하고, 취향을 규칙처럼 강제하지 않는다.

참고 프레임워크:

- OpenAI Product Design audit framework: https://github.com/openai/role-specific-plugins
- Figma custom rules: https://developers.figma.com/docs/figma-mcp-server/add-custom-rules/
- Vercel Web Interface Guidelines: https://github.com/vercel-labs/web-interface-guidelines
