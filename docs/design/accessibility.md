# 접근성 기준

## 목표와 적용 범위

KOSMO의 Web 디자인과 구현은 적용 가능한 [WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level A·AA 성공 기준을 기본 목표로 한다. Level AAA는 저장소 전체의 완료 조건이 아니며, 사용자 위험이나 컴포넌트 맥락상 필요한 기준만 별도 계약으로 강화한다.

이 목표는 현재 제품 전체가 이미 WCAG 2.2 AA를 준수한다는 선언이나 접근성 인증·법률 자문을 뜻하지 않는다. 기능이나 PR의 접근성 결과는 "적용 가능한 A·AA 성공 기준에 대응했다" 또는 "부분 평가 증거를 확보했다"고 표현하고, 평가 범위, 적용한 성공 기준, 자동화와 수동 관찰 결과, 확인하지 못한 항목을 함께 기록한다.

[WCAG 2.2의 정식 Level AA 적합성](https://www.w3.org/TR/WCAG22/#conformance-reqs) 주장은 기능이나 PR 일부가 아니라 완전한 Web page와 전체 process를 대상으로 한다. 이 표현을 사용하려면 적용 가능한 Level A·AA 성공 기준 전체뿐 아니라 accessibility-supported 방식, non-interference 등 모든 적합성 요구사항을 충족해야 한다. 선택적으로 적합성 주장을 공개할 때는 날짜, WCAG 제목·버전·URI, 충족 수준, 대상 page 설명, 의존한 Web 기술 목록 등 [필수 claim 항목](https://www.w3.org/TR/WCAG22/#conformance-claims)을 함께 기록한다.

Android·iOS 같은 Native App에는 WCAG를 Web과 같은 방식으로 직접 적용했다고 표현하지 않는다. [WCAG2ICT](https://www.w3.org/WAI/standards-guidelines/wcag/non-web-ict/)의 A·AA 매핑을 해석 지침으로 사용하고 각 플랫폼의 접근성 지침과 runtime 관찰을 함께 적용한다. WCAG2ICT는 비규범적 W3C Group Note이므로 Native App의 접근성을 전부 보장하거나 별도의 플랫폼 요구사항을 대체하지 않는다.

## 플랫폼별 기준

| Surface    | 기본 기준                                | 단위와 target 계약                                                                                                                                       |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web        | WCAG 2.2 Level A·AA                      | pointer target은 원칙적으로 24×24 CSS px 이상이다. 조밀한 icon action은 컴포넌트 계약에 따라 32×32 또는 36×36 CSS px를 사용할 수 있다.                   |
| iOS·iPadOS | WCAG2ICT A·AA 매핑과 Apple HIG           | 보이는 glyph와 무관하게 기본 hit region은 44×44 pt를 사용한다. 더 작은 control은 Apple 지침과 컴포넌트별 근거·간격·runtime 검증이 있을 때만 예외로 둔다. |
| Android    | WCAG2ICT A·AA 매핑과 Android 접근성 지침 | 보이는 glyph와 무관하게 touch target은 48×48 dp 이상을 기본으로 한다.                                                                                    |

CSS px, pt, dp는 서로 다른 플랫폼 단위다. 저장소의 공통 목표가 A·AA라는 이유로 Web과 Native App의 target 숫자를 하나로 통일하지 않는다. React Native Web으로 렌더되는 surface는 Web 기준을 적용하고 실제 Android·iOS binary는 각 Native 기준을 적용한다.

### Post Action Bar의 출시 전 임시 예외

Post Action Bar는 현재 Web 우선 출시 범위의 Figma geometry를 먼저 맞추기 위해 모든 플랫폼 구현에서 control 높이와 실제 interactive target 높이를 28 logical unit(CSS px·pt·dp)로 통일한다. 이 예외는 [post-action-bar.md](./post-action-bar.md)가 소유하며 다른 toolbar나 icon button의 선례로 일반화하지 않는다.

- Web의 28px target은 24×24 CSS px 자체를 포함하고 인접 action과 겹치지 않아야 한다.
- iOS·Android의 28pt·28dp target은 위 표의 Native baseline을 충족하지 않는다. Native binary가 아직 출시 범위가 아니기 때문에 구현 일관성을 위한 임시 값으로만 허용하며, Native 접근성 준수나 runtime 검증 완료 증거로 사용하지 않는다.
- iOS 출시 전에는 실제 hit target을 최소 44×44pt, Android 출시 전에는 최소 48×48dp로 복구하고, 28px visual geometry를 유지할지 포함해 각 플랫폼 assistive technology와 touch runtime에서 다시 검증한다.

## Web target과 밀도

[WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)은 Level AA에서 pointer target이 최소 24×24 CSS px이거나 공식 예외를 만족하도록 요구한다. 공식 예외는 spacing, equivalent control, inline target, user-agent control, essential presentation이다.

- KOSMO가 직접 만든 독립 control은 가능한 한 24×24 CSS px 자체를 확보한다. 24px보다 작은 target을 spacing 예외로 처리해야 한다면 인접 target과의 24 CSS px 평가 원이 겹치지 않는지 검증하고 예외 근거를 남긴다.
- 조밀한 Action Bar·toolbar의 icon action은 32×32 또는 36×36 CSS px처럼 44px보다 작은 target을 선택할 수 있다. exact size와 간격은 해당 컴포넌트 계약이 소유하며, 전역 convention만을 이유로 보이지 않는 상하 padding을 44px까지 추가하지 않는다.
- [SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)의 44×44 CSS px는 Level AAA 강화 기준이다. 중요한 control, 오류 비용이 큰 control, touch 중심 Web surface에서는 선택적으로 적용할 수 있지만 모든 Web control의 전역 최소값은 아니다.
- target이 둥글거나 clipping된 경우 bounding box 숫자만으로 크기 요구사항 통과를 판단하지 않는다. 크기 요구사항은 target 내부에 축 정렬된 24×24 CSS px 사각형을 포함할 수 있는지 확인한다. 이를 충족하지 못한 target의 spacing 예외를 평가할 때만 bounding box 중심에 24 CSS px 지름의 원을 배치한다.

## Visual geometry와 interactive target

보이는 icon·glyph·label 크기, control이 layout에서 차지하는 크기, 실제 pointer/touch를 받는 target은 같은 값일 필요가 없다.

- 16·20·24 크기의 glyph를 더 큰 target 안에 배치할 수 있다. target을 키운다는 이유로 glyph나 배경을 같은 크기로 확대하지 않는다.
- hit slop이나 별도 interaction layer로 target을 확장할 때 인접한 서로 다른 action target과 겹치지 않게 한다. 서로 다른 target이 겹치면 겹친 영역은 각 target의 유효 크기로 계산하지 않는다.
- 시각적으로 조밀한 row를 만들 때도 focus indicator, pressed·selected·disabled·busy 상태와 accessible name을 보존한다.
- Native에서 visual control을 작게 유지하더라도 iOS·Android의 실제 hit/touch target과 assistive technology focus 경계는 플랫폼 기준을 충족해야 한다.

## 의미와 입력 방식

- 모든 interactive element는 실제 동작에 맞는 role, accessible name, state를 제공한다. selected, expanded, pressed, disabled, busy와 오류 상태를 색이나 모양만으로 전달하지 않는다.
- Web의 모든 기능은 keyboard로 도달하고 실행할 수 있어야 한다. focus-visible을 숨기지 않고 modal·menu·popover는 open, 이동, dismiss, focus restore를 검증한다.
- 상태 변화와 오류는 필요한 경우 `aria-live` 또는 플랫폼 equivalent로 보조 기술에 전달한다. 같은 내용을 중복 announcement하지 않는다.
- pointer, touch, keyboard와 screen reader 경로가 서로 다른 제품 결과를 만들지 않게 한다. 복잡한 gesture가 필요하면 같은 결과를 제공하는 단순 control을 둔다.
- text scaling, zoom, reflow처럼 target 크기만으로 확인할 수 없는 A·AA 기준도 해당 surface 범위에서 함께 검토한다.
- 사용자 상호작용으로 시작된 비필수 motion animation을 끌 수 있게 하는 [SC 2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)은 Level AAA다. `prefers-reduced-motion` 대응은 저장소 전체의 A·AA 완료 조건이 아니며, 사용자 위험이나 컴포넌트 맥락상 필요할 때 별도 강화 계약으로 적용한다. 자동으로 시작되어 5초를 넘는 moving·blinking·scrolling content의 일시정지·중지는 Level A인 SC 2.2.2로 별도 평가한다.

## 가독성과 색상

텍스트·아이콘·상태 표현은 적용 가능한 WCAG 2.2 A·AA 대비와 비색상 정보 전달 기준을 목표로 한다. 디자인 token이나 Figma 값이 존재한다는 사실만으로 대비를 통과한 것으로 보지 않는다.

현재 `apps/app/.storybook/preview.tsx`는 Storybook a11y를 `error` 모드로 실행하지만 `color-contrast` 규칙을 명시적으로 제외한다. 따라서 Storybook a11y 통과는 semantic·검출 가능한 일부 규칙의 증거이며 색상 대비를 포함한 전체 AA 준수 증거가 아니다. 이 문서는 해당 debt를 수정하지 않고 검증 공백으로 기록한다.

## 검증과 보고

자동화는 수동 runtime 관찰을 대체하지 않는다. 변경 범위에 맞춰 다음 증거를 구분해 기록한다.

| 증거                | 확인하는 범위                                                            | 대체하지 못하는 것                                                                 |
| ------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 정적·Storybook a11y | role, name, 일부 state와 axe가 검출하는 규칙                             | 실제 keyboard 흐름, screen reader announcement, 제외된 color contrast, Native 동작 |
| Web runtime         | keyboard, focus, pointer·touch, zoom·reflow, browser screen reader 동작  | Android·iOS assistive technology와 플랫폼 target                                   |
| Android·iOS runtime | TalkBack·VoiceOver, font scaling, platform target, modal·sheet와 gesture | Web browser의 WCAG 적합성                                                          |
| 시각 검토           | density, focus indicator, 상태 식별, token 대비                          | programmatic semantics와 announcement                                              |

PR과 이슈에는 실행한 자동화, 실제 관찰한 platform·viewport·입력 방식, 실행하지 못한 검증을 나눠 적는다. 특정 surface만 확인했다면 제품 또는 저장소 전체가 AA를 만족한다고 일반화하지 않는다.

## 컴포넌트별 계약의 우선순위

이 문서는 전역의 무조건적인 44×44 규칙을 제거하지만, 컴포넌트의 플랫폼별 exact contract를 임의로 바꾸지 않는다.

- Reaction Quick Picker와 Reaction 요약 token은 [reactions.md](./reactions.md)의 Web 32×32 CSS px geometry를 사용한다. 이 값은 SC 2.5.8의 24×24 CSS px minimum을 자체 크기로 충족하며, `apps/app/src/stories/Reactions.stories.tsx`의 Web exact-size assertion도 32×32로 맞춘다.
- 이번 Web 우선 Reaction 변경은 Native interaction geometry를 수정하지 않는다. 현재 selector·summary의 44 logical unit과 Profile tab의 32 minimum은 iOS Profile tab 44×44pt 및 Android 48×48dp baseline을 모두 충족하는 구현이 아니다. Native 출시 전 iOS target을 최소 44×44pt, Android target을 최소 48×48dp로 복구하고 assistive technology·touch runtime에서 검증한다. Web 검증은 이 출시 gate를 대체하지 않는다.
- Post Action Bar는 `post-action-bar.md`의 component-specific 28px geometry를 사용한다. 기존 PROD-433의 최소 44×44 assertion은 이 결정에 맞춰 PROD-414에서 교체하되, 이 변경을 전역 Web 또는 Native target 완화로 해석하지 않는다.
- Post Action Bar의 Native 28pt·28dp 값은 출시 전 임시 예외다. iOS 44×44pt와 Android 48×48dp 복구 및 runtime 관찰은 Native 출시 gate이며 현재 Web 우선 slice의 완료 증거와 분리한다.
- 순수 Repost의 `{displayName}님이 재게시함` Profile link는 독립 icon button이 아니라 attribution 문장 전체에
  적용된 text link다. Web에서는 SC 2.5.8의 inline target 예외를 사용해 14/20 line box를 유지하며 role,
  accessible name, keyboard focus와 navigation을 보존한다. Native 출시 전에는 이 링크의 44pt·48dp target,
  focus boundary와 바로 아래 Source Author link 비중첩을 runtime에서 다시 검증한다.
- 새 컴포넌트는 이 문서의 플랫폼 baseline을 사용한다. 더 큰 target이나 엄격한 검증이 필요하면 컴포넌트 디자인 문서·Linear·OpenSpec에 이유와 exact contract를 기록한다.

## 이 문서가 변경하지 않는 것

- 기존 UI의 접근성 결함을 일괄 수정하지 않는다.
- Post Action Bar 외의 기존 44×44 컴포넌트와 테스트를 일괄 축소하지 않는다.
- Storybook의 `color-contrast` 제외를 해소하지 않는다.
- 접근성 인증이나 법적 준수를 선언하지 않는다.

## 참고 자료

- [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/)
- [Understanding SC 2.5.8: Target Size (Minimum), Level AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Understanding SC 2.5.5: Target Size (Enhanced), Level AAA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- [WCAG2ICT Overview](https://www.w3.org/WAI/standards-guidelines/wcag/non-web-ict/)
- [Apple Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Android Developers: Make apps more accessible](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views)
