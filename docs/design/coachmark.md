# Coachmark

`Coachmark`는 단계형 온보딩에서 대상 옆에 짧은 안내와 진행 action을 보여주는 공용 말풍선이다. 실제 화면 연결, 최초 노출 저장, 투어 상태와 hover 도움말은 caller가 소유한다.

아래 geometry와 크기 수치는 플랫폼 공용 `logical unit`으로 표기한다(Web CSS px, iOS pt, Android dp). 실제 Native 기기 렌더링은 별도 검증 대상이다.

## 공개 계약

`apps/app/src/components/ui/Coachmark.tsx`의 공개 props는 다음과 같다.

| Prop          | 필수 | 타입                      | 역할                                                                          |
| ------------- | ---- | ------------------------- | ----------------------------------------------------------------------------- |
| `visible`     | 예   | `boolean`                 | 말풍선 표시와 퇴장 상태를 제어한다.                                           |
| `anchorRef`   | 예   | `RefObject<View \| null>` | 실제 대상 `View`의 화면 좌표를 배치 기준으로 사용한다.                        |
| `title`       | 선택 | `string`                  | 짧은 제목이다. 생략·공백이면 제목을 숨기고 본문을 접근성 이름으로 사용한다.   |
| `description` | 예   | `string`                  | 짧은 안내 본문이다.                                                           |
| `onClose`     | 예   | `() => void`              | 건너뛰기, Escape, Native back, backdrop dismiss의 공통 callback이다.          |
| `onComplete`  | 예   | `() => void`              | 완료 action이다. 단일 안내와 마지막 단계에 사용하며 caller가 안내를 종료한다. |
| `onPrevious`  | 선택 | `() => void`              | 이전 단계로 이동한다. 단계형 안내에서 생략하면 첫 단계의 이전이 비활성화된다. |
| `onNext`      | 선택 | `() => void`              | 있으면 기본 action이 다음으로 바뀌며 caller가 다음 단계와 anchor를 선택한다.  |
| `children`    | 선택 | `ReactNode`               | 하단 action 행에서 건너뛰기 왼쪽에 단계 번호 등 보조 내용을 합성한다.         |

단계 상태·진행 번호·최초 노출 저장은 caller가 소유한다. 공용 컴포넌트가 `이전`·`다음`·`완료`와 `건너뛰기` action을 렌더한다. `onNext`가 있으면 다음, 없으면 완료를 표시한다. `onNext` 또는 `onPrevious`가 있으면 단계형 이전·다음 묶음을 표시하고, 둘 다 없으면 단일 완료 버튼을 표시한다. 완료와 중단을 구분하도록 `onComplete`와 `onClose`는 분리한다. `width`, `height`, `style`, `size`, `placement` public prop은 제공하지 않는다.

## 배치와 동작

- 말풍선 폭은 내용에 맞추되 256 logical unit 상한으로 하고, 좌우 safe area와 viewport 가장자리에서 16 logical unit 안으로 clamp한다. 높이는 콘텐츠에 따라 자동으로 정해지며 가용 공간을 상한으로 사용한다.
- `anchorRef`의 실제 화면 좌표를 기준으로 anchor와 12 logical unit 간격을 두고 아래 공간이 부족하면 위에 배치한다. 가장자리 여백은 16 logical unit이다.
- 화살표는 변 길이 16 logical unit인 정사각형을 45도 회전하고, 위치 보정에는 half-size 8 logical unit을 사용한다. 화살표 중심은 대상 중심을 향하되 말풍선 좌우 경계에서 최소 16 logical unit 떨어지도록 제한한다. 본문·footer를 말풍선 내부 하나의 스크롤 영역에 둔다. 긴 안내와 매우 작은 높이에서도 설명과 버튼을 모두 접근할 수 있다.
- 표면은 radius 16 logical unit, border 1 logical unit, 상단·좌우 padding 12 logical unit, 하단 padding 8 logical unit을 사용한다. 본문과 하단 action 행 사이는 8 logical unit이며 footer의 가로 action gap은 공용 `dialogActions` 규칙인 8 logical unit을 따른다.
- 제목은 `uiLabelM`(14/20 logical unit), 본문은 `uiCopyM`(14/20 logical unit)을 사용하며 제목과 본문 사이 간격은 8이다. dialog 접근성 이름은 제목을 우선하고 제목이 없으면 본문을 사용한다. X 닫기는 제공하지 않는다.
- 본문과 action은 세로로 배치한다. 하단 행은 단계 번호를 콘텐츠 왼쪽 끝에, 건너뛰기와 이동 action 묶음을 오른쪽 끝에 둔다. 단계 표시의 줄 영역과 오른쪽 action 묶음은 하단 기준으로 정렬하고, action 내부 버튼은 세로 중앙 정렬한다. 단계 번호와 건너뛰기의 작은 텍스트는 12/20 logical unit으로 줄 높이를 맞춘다. 하단 오른쪽에 `이전 | 다음` 또는 `이전 | 완료`를 하나의 외곽선과 가운데 1 logical unit 구분선으로 묶는다. 묶음 내부 gap은 0이며 선택 상태를 가진 segmented control이 아닌 서로 독립적인 이동 action이다. 첫 단계의 이전은 비활성화한다. 건너뛰기는 묶음 밖 왼쪽에 12 logical unit 텍스트로 표시한다. `다음`·`완료`는 theme primary 채움과 on-primary 텍스트를 사용하고, `이전`은 secondary로 구분한다. 공용 `Button` compact를 사용하되 이동 action 텍스트는 `uiLabelS` 기반 12/20 logical unit으로 본문보다 작게 표시한다. 최소 너비는 Web 36, iOS 44, Android 48 logical unit, 수평 padding은 4, 수직 padding은 0이다. Web 높이는 24 CSS px로 줄이며 Native는 iOS 44pt·Android 48dp 입력 영역을 유지한다. 외곽선 두께는 묶음 바깥에 추가된다. 단일 안내는 이전 없이 작은 완료 버튼만 표시한다.
- 높이를 고정하지 않는다. 기본 높이는 위아래 padding·border, 실제 본문 높이, 본문과 action 사이 8 logical unit, action 높이로 결정된다. 단계 번호·줄바꿈·글자 확대에 따라 늘어나며 가용 높이를 넘으면 내부 스크롤로 모든 action에 접근한다. public height·minHeight prop은 추가하지 않는다.
- 본문은 기본 두세 줄 이내로 작성하되, 확대·번역·좁은 화면에서 줄 수를 강제로 잘라내지 않는다. 긴 소개·동의·설정은 별도 sheet나 화면으로 구성한다.
- 배경과 표면은 theme semantic color를 사용하고 표면 elevation은 `elevation.overlay`를 따른다.
- 배경에는 `theme.overlayScrim`을 칠해 조작을 막고 target에는 spotlight 구멍을 만들지 않는다. 건너뛰기, Escape, Native back, backdrop dismiss는 `onClose`로 수렴한다. 대상도 backdrop 뒤에서 차단되므로 대상 터치로 투어를 진행하지 않는다.
- 표시와 퇴장에는 `useOverlayMotion`과 `ModalSheetHost`를 사용한다. reduced-motion에서는 기존 overlay 계약에 따라 이동을 제거한다. Web focus entry·trap·restore와 body scroll lock은 기존 overlay lifecycle 및 Modal host 경계를 따른다. 단계의 anchor ref가 바뀌어도 안내 도중 focus를 배경으로 복귀시키지 않는다. 다음 이동 뒤 action focus를 유지하고 종료할 때 현재 단계의 대상으로 복귀한다.

## Storybook 검증

`KOSMO/Patterns/Coachmark`의 `Playground`는 Controls와 Actions를 통한 수동 검토용이다. 기본 args는 짧은 제목과 본문, 건너뛰기·완료를 표시하는 단일 안내다. `LongerMessage`, `Steps`, `LongContent`는 긴 문장·단계 이동·극단적인 긴 내용의 대표 상태다. `Mobile320`, `Mobile360`, `Mobile390`은 각각 320×568, 360×800, 390×844 Web viewport를 제공한다.

`KOSMO/Patterns/Coachmark/Tests`는 기본 안내의 접근성 이름과 완료·건너뛰기의 분리 및 focus 복귀, 배경 차단, 단계 이동·완료, 모바일 3개 폭의 경계·가로 overflow, 긴 내용의 스크롤·action 접근, 작은 높이의 배치를 검증한다. `TextScaleContract`는 320px Web viewport에서 본문 font-size·line-height만 200%로 늘려 reflow와 완료를 검사하는 자동화 전용 probe다. Native Dynamic Type 검증을 대신하지 않는다.

Storybook 증거는 Web presentation·interaction 범위이며 iOS·Android runtime 또는 실제 화면 연결 완료를 의미하지 않는다. 자동 a11y의 전역 color-contrast 제외는 유지되므로 전체 WCAG 적합성이나 대비 검증 완료를 뜻하지 않는다.

### Web 검증 기록 · 2026-10-15

- 내장 Browser의 320×568 viewport에서 제목을 복원한 두 번째 단계 예시는 256×124 CSS px였다. 단계 표시의 줄 영역과 오른쪽 이동 버튼 묶음은 surface 하단에서 각각 9px(하단 padding 8 + border 1) 떨어져 있으며 가로 overflow가 없었다.
- 최신 main 기준 전체 Storybook 142개 파일·928개 테스트, 배치 helper 4개 테스트, TypeScript, ESLint, Prettier, 정적 Storybook 빌드를 통과했다. 관련 Storybook 17개 테스트는 제목 없는 안내의 fallback 접근성 이름, 단계 이동·완료·중단, focus 복귀, 모바일 세 폭·작은 높이·본문 200% 확대를 포함한다.
- Native 실기기·VoiceOver·TalkBack·Dynamic Type 검증은 별도다. Web 결과를 Native runtime 검증으로 간주하지 않는다.
