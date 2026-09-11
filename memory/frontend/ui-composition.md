# Frontend: UI Composition And Styles

Read this entire file when changing shared React Native presentation, layout, accessibility, post content, or UI copy.

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
- Figma/OpenSpec 수치와 theme token이 다르면 같은 변경에서 정렬한다. 긴 문자열, 빈 값, RTL/줄바꿈처럼 layout을 깨뜨릴 수 있는 상태는 story 또는 test에 포함한다.
