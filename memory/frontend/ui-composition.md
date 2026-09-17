# Frontend: UI Composition And Styles

Read this entire file when changing shared React Native presentation, layout, accessibility, post content, UI copy, or action/composition ownership.

## UI Composition And State Ownership

- `useRef`와 `useEffect`는 기본적으로 제거 대상이다. 새 코드의 기준은 두 hook을 "올바르게 쓰는 것"이 아니라 선언형 대안으로 삭제하는 것이며, 먼저 controlled props, render-time derivation, event handler, `key` remount, 기존 framework/common primitive를 검토한다.
- `useRef`는 선언형으로 표현할 수 없는 피할 수 없는 DOM/Native/platform imperative handle에만 허용한다. 이전 props/state 보관, derived state, callback 사이 값 전달, visibility·close reason·navigation coordination, 늦은 async response 격리에 사용하지 않는다. 늦은 응답 경쟁이 보이면 구현을 멈추고 그 경쟁을 만드는 제품·interaction 요구사항이 정말 필요한지 사용자에게 먼저 확인한다. 기본 가정은 불필요한 요구사항이므로 제거하거나 단순화하는 것이며, 필요하다는 답만으로 component ref, generation token, cancellation guard, 별도 operation ownership/state machine을 허용하지 않는다.
- `useEffect`는 외부 시스템과 동기화할 때만 허용한다. 내부 상태 choreography, props/state 파생, callback 결과 전달, visibility·focus·navigation 순서 조정에 사용하지 않으며 cleanup이 있다는 이유만으로 정당화하지 않는다. 새 ref/effect는 선언형 대안이 왜 불가능한지 코드 근처에 설명한다.
- Overlay는 composition point/Shell이 visibility, 명시적 close reason, navigation을 소유하고, 공용 Overlay/Dialog primitive가 Escape·Tab·scroll lock·focus restoration을 소유하며, feature component가 draft/mutation을 소유한다. 테스트는 내부 ref/effect가 아니라 observable open/close/focus/navigation behavior를 검증한다.
- 개별 action은 자신의 실행과 그에 필요한 데이터·상태·상호작용(fragment·mutation·pending/error·Relay/cache 갱신 등)을 소유한다. 같은 관계의 중복 fragment/prop·ID를 받아 합치지 않는다. 여러 행동의 노출·순서·배치는 해당 조합의 의미와 정책을 소유하는 경계에서 결정한다. 그 경계를 메뉴·화면 같은 컴포넌트 종류나 단순한 부모·자식 위치로 고정하지 않는다.
- 정상적인 관계 mutation으로 생긴 Environment/Store remount를 보상하려고 module 전역 focus registry/Map, actor lifecycle key, timer를 추가하지 않는다. 상위 RelayActorBoundary가 이미 remount하는 route에 opaque actor key를 중복 배선하지 않는다. focus는 현재 React tree의 trigger·heading ref와 modal `onDismiss`로 복원한다. actor A→B 전환 뒤 늦은 응답 경쟁이 보이면 구현을 멈추고 전환 중 병렬 동작이 정말 필요한지 사용자에게 먼저 확인하며, 기본적으로 해당 요구를 제거하거나 단순화한다. component ref·generation harness·cancellation guard·별도 operation state machine으로 보정하지 않는다.
- 공개 callback은 실제 production 조정이 필요하거나 명시적인 controlled/presentation 계약일 때만 둔다. UI close나 toast 같은 후속 표시 callback은 허용하지만, 테스트 계측용 lifecycle callback이나 아직 production caller가 없는 미래 mutation callback을 공개 API로 올리지 않는다. callback 때문에 action이 소유할 서버 상태 변경 책임을 조합 경계로 떠넘기지 않는다.
- 공용 primitive, `children`, 조합 지점은 공유하되 화면·목록 전체를 재사용하려고 `mode`/`options` prop으로 자식의 세부 상태를 노출하지 않는다.
- Storybook-first presentation은 production caller보다 먼저 제공할 수 있다. caller가 없다는 이유만으로 표시 UI를 삭제하지 않는다.
- `open`·`disabled`·`quote`·`reply`처럼 서로 관련된 상태의 유효한 조합은 기존 coordinator·type·정규화로 보장한다. 실제 전이 복잡도나 별도 계약이 생긴 근거 없이 새 state machine을 필수로 도입하지 않는다.

## React Native Components And Styles

- `View`, `Text`, `TextInput`, `Pressable`, `Modal`, `ScrollView` 등 React Native primitive를 기본으로 사용한다. browser-only element나 DOM API는 platform 경계 밖의 공용 컴포넌트에 넣지 않는다.
- system bar·viewport edge까지 backdrop을 확장하는 Web·iOS·Android overlay는 바깥 backdrop이 네 방향 safe area를 한 번만 소유한다. scrim은 끝까지 칠하고 interactive surface만 inset 안에 두며, fullscreen·centered·drawer 같은 presentation 분기는 기본 여백과 배치만 결정한다. Native `Modal`은 system bar 아래까지 backdrop을 확장한 뒤 같은 경계에서 inset을 소비하고, surface 안에 `SafeAreaView`를 중첩해 다시 소비하지 않는다.
- 색상, spacing, radius, typography, breakpoint는 `apps/app/src/theme` token을 사용한다. 일회성 raw hex/숫자로 Foundation 값을 복제하지 않는다.
- UI 텍스트는 `fontFamilies.ui`(`SUIT Variable`), 포스트 본문과 긴 입력은 `fontFamilies.content`(`Pretendard Variable`)를 사용한다. React Native에는 CSS 상속이 없으므로 공용 primitive 또는 각 `Text`/`TextInput` style에서 family를 명시한다. `apps/app/src/app/_layout.tsx`는 Variable TTF를 모든 플랫폼에서 번들 로드하며 iOS 등록 key(`SUIT`, `Pretendard`)는 consumer family name과 분리한다.
- 접근성 목표와 target은 [`docs/design/accessibility.md`](../../docs/design/accessibility.md)를 따른다. Web은 적용 가능한 WCAG 2.2 A·AA와 24×24 CSS px 최소 target·공식 예외를 사용하고, iOS는 기본 44×44 pt hit region, Android는 48×48 dp touch target을 사용한다. 기존 component-specific 강화 계약은 전역 기준보다 우선한다. Profile Tag 제거 action은 시각 크기 32×32, 실제 입력 target Web 32×32 CSS px, iOS 44×44pt, Android 48×48dp를 사용한다. `accessibilityRole`, `accessibilityLabel`, `accessibilityState`를 실제 동작과 맞추고 선택 tab, disabled/loading button, modal/drawer 상태를 시각 표현만으로 전달하지 않는다.
- `useWindowDimensions`로 layout 단계를 고르되 product breakpoint 값은 token에서 읽는다. render 중 플랫폼 전역 `window`를 직접 읽지 않는다.
- 게시글 canonical read 계약은 schema version이 식별된 ProseMirror document JSON이다. composer는 trim된 Plain Text를 `CreatePostInput.bodyText`로 계속 제출하고 서버 공통 경계가 document로 변환한다. PostContent V1 Media block node는 Media global ID projection과 문서 순서를 제공하고, 실제 Media GraphQL Node가 URL, Media Type과 nullable Alt Text를 소유하며 document root의 optional Sensitive Media attr는 생략 시 false다. 현재 Composer 이미지 업로드는 ordered Media item을 create input에 함께 제출하되 앱에서 ProseMirror document를 만들지 않는다. 앱은 native-safe JSON 타입과 제한된 paragraph/text/hard-break/link renderer를 사용하며 Media 목록·상세 렌더링이 별도 계약인 동안 Media node가 있는 document의 텍스트는 파생 `bodyText` fallback으로 표시할 수 있다. `prosemirror-model` 검증/canonicalization은 server-only subpath에 두고 앱 bundle에는 TipTap, ProseMirror runtime/editor/view 또는 WebView editor를 포함하지 않는다.

## UI And Copy

- 프로필 표시 문자열은 `Profile.relativeHandle`을 사용하고 `Profile.handle`은 lookup, validation, route parameter 정규화에만 사용한다.
- backend error `message`를 그대로 노출할지 error code로 분기할지는 공용 정책에서 결정한다. 정책이 없으면 안전한 한국어 fallback을 우선한다.
- Figma와 canonical design 수치가 theme token과 다르면 같은 변경에서 정렬한다. OpenSpec session harness의
  임시 수치는 추가 디자인 계약이 아니며, 그것만을 이유로 UI를 확장하지 않는다. 긴 문자열, 빈 값, RTL/줄바꿈처럼
  layout을 깨뜨릴 수 있는 상태는 story 또는 test에 포함한다.
