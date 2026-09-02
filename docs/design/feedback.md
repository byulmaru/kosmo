# 피드백 화면

인증된 사용자의 피드백 화면은 KOSMO의 공용 페이지 위계 안에서 의견 종류와 내용을 입력하고 제출하는
집중된 폼을 제공한다. 제출 계약은 [PROD-487](https://linear.app/byulmaru/issue/PROD-487)에 따르고,
[PROD-547](https://linear.app/byulmaru/issue/PROD-547)은 Web page surface를,
[PROD-594](https://linear.app/byulmaru/issue/PROD-594)는 Web shell overlay를 소유한다.

## 현재 계약과 overlay-only Target

- 현재 runtime은 Web의 일반 진입만 현재 route 위 overlay로 열고, Web의 직접 `/feedback` 접근·새로고침과
  Android·iOS에서는 기존 page route를 유지한다. 이는 PROD-594가 완료한 호환 계약이다.
- Target은 전 플랫폼의 일반 피드백 진입을 overlay 또는 sheet로 통일하고 `/feedback` 직접 route를 제거하는
  것이다. Native presentation, deep link·새로고침 fallback과 기존 route 제거는 별도 Product 이슈가 소유한다.
- DSN-51은 overlay Target과 Figma consumer를 기록하지만 route 제거, Native 구현이나 runtime 통과를 완료로
  주장하지 않는다. 아래 page와 Web overlay 규칙은 별도 표시가 없으면 현재 runtime 계약이다.

## 정보 위계

- 현재 호환 `/feedback` route는 공용 `PageHeader`의 `text` variant로 `피드백 보내기` 제목을 한 번 표시한다.
- 폼은 제목을 다시 표시하지 않고 설명, 피드백 종류, 피드백 내용, 제출 상태, primary action 순으로 배치한다.
- 피드백 종류는 공용 `RadioOption`의 20px indicator와 10px inner dot, label 및 semantic state visual을 사용하고, 선택된 row 전체 fill이나 consumer 전용 option divider·card를 추가하지 않는다.
- 피드백 내용은 공용 `TextField`의 multiline 입력을 사용한다.
- `피드백 보내기` primary action은 폼의 전체 너비를 사용한다.
- 색상, 간격, 반경, typography와 breakpoint는 공용 token을 사용한다.

## 반응형 Page Surface

- Web 모든 breakpoint는 같은 정보 위계와 평면 폼을 사용한다.
- route가 `PageHeader`, document scroll, page padding과 중앙 콘텐츠 최대 폭을 소유한다.
- `< compact`에서는 모바일 셸과 하단 탭을 유지하며, `compact`와 `full`에서는 기존 중앙 route column을 쓴다.
- breakpoint는 [breakpoints.md](./breakpoints.md)의 `compact=768`, `full=1280`을 그대로 사용한다.
- `PageHeader`의 높이, heading과 scroll 소유권은 [page-header.md](./page-header.md)를 따른다.

## Form과 Presentation 소유권

피드백 form은 입력, 검증, 제출과 결과 상태를 소유하되 자신이 page인지 popup인지 판단하지 않는다.

- form 소유: 종류와 본문 draft, radio group 배치, validation, `submitFeedback`, pending 입력 차단, 성공·실패 표시, 성공 시 초기화,
  실패 시 draft 유지
- 공용 `RadioOption` 소유: 각 option의 indicator·content·내부 spacing과 selected·hover·pressed·disabled·focus visual
- 현재 호환 page 소유: `PageHeader`, page padding, document scroll, 중앙 콘텐츠 폭
- overlay 소유: dialog/sheet 제목, 닫기 action, 크기와 위치, backdrop, `Escape`, focus trap·복원, 배경 차단

Form은 `{dirty, submitting}` 상태만 presentation에 알리고 overlay, navigation, confirmation이나 URL을 알지
않는다. Overlay의 명시적 닫기 경로는 하나의 `requestClose` 경계를 사용한다.

현재 Android와 iOS는 기존 `/feedback` route와 page surface를 유지한다. 이는 overlay-only Target의 완료
증거가 아니며 Native 이관 전까지의 runtime 호환 동작이다.

## Web Overlay

- 로그인한 사용자가 Web full sidebar, compact icon rail 또는 mobile drawer의 `피드백 보내기` 버튼을 실행하면
  `UniversalShell`의 로컬 상태가 현재 route 위 단일 overlay를 연다.
- 열기와 닫기는 pathname, query, browser history entry를 추가하거나 변경하지 않는다. URL의
  `feedback=open`은 overlay 진입 계약이 아니며 직접 접근·새로고침 시 무시한다.
- overlay는 shell root와 나란한 단일 인스턴스로 sidebar, 중앙 route, right rail과 mobile chrome 전체를
  덮고 기존 route tree와 document scroll을 배경에 유지한다.
- 현재 `/feedback` 직접 URL 접근과 새로고침은 기존 보호 route fallback을 유지하며 그 위에 overlay를 중복
  표시하지 않는다.
- 종류나 본문이 초기값에서 바뀐 dirty 상태에서 닫기 버튼, backdrop 또는 `Escape`를 실행하면 draft 폐기
  확인을 표시한다. 취소는 overlay와 draft를 유지하고, 폐기는 overlay를 닫는다.
- 제출 중에는 닫기 버튼, backdrop과 `Escape`를 차단한다.
- browser Back/Forward, reload, 주소 이동과 tab close는 overlay close contract에 포함하지 않는다. 따라서 이
  경로에서 dirty draft 보존이나 제출 중 이탈 차단은 보장하지 않는다.
- 성공 후에는 성공 문구와 초기화된 form을 overlay 안에 유지해 연속 제출을 허용한다. 실패 후에는 오류,
  재시도와 draft를 유지한다.
- `<768px` Web은 viewport 아래 bottom sheet, `>=768px` Web은 최대 약 `600px` 너비와 `85dvh` 높이의 중앙
  dialog를 사용한다. 두 surface 모두 form body만 내부 scroll한다.
- Mobile Target evidence는 기존 [`Idle bottom sheet`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6665-56255)와
  [`Error · Draft retained`](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=6773-11567)이다.
  두 frame은 `04 Screens - Mobile`의 `01 Mobile Web exceptions`에 격리하며 Native baseline으로 세지 않는다.
  Error consumer는 host·scrim·sheet·PageHeader를 보존하고 `FeedbackForm`만 existing Error source
  `1931:2409`로 교체한다. Native direct page는 현재 호환 runtime route이지 누락된 canonical screen이 아니다.
  Native overlay/sheet와 route 제거는 Product handoff이며, dirty-close confirmation은 runtime lifecycle로
  검증한다.
- overlay는 제목과 accessible close control을 제공하고 focus를 내부로 이동·가둔다. 배경 shell은 pointer,
  keyboard와 accessibility tree 상호작용에서 차단하며 닫힌 뒤 유효한 이전 focus와 document scroll을 복원한다.
- 비로그인 public shell에는 피드백 버튼과 overlay form을 노출하지 않는다.

## 상태와 동작 불변조건

- idle은 기본 `좋아요` 종류와 빈 본문으로 시작하며 유효한 본문 전에는 제출을 비활성화한다.
- pending은 종류, 본문과 제출 action의 중복 입력을 차단한다.
- 성공은 기존 성공 문구를 표시하고 종류와 본문을 초기화한다.
- delivery failure와 GraphQL failure는 기존 오류, 재시도 action, 종류와 본문을 유지한다.
- `submitFeedback` mutation, Slack payload, route와 인증 경계, radio·status·busy semantics는 변경하지 않는다.
- 재현 환경은 별도 필드나 자동 감지 metadata로 수집하지 않는다.

## 검증

- Storybook에서 idle, validation, pending, success, failure와 실패 후 입력 유지를 확인한다.
- Web E2E에서 shell 버튼 open/close 동안 URL 불변, `feedback=open` 직접 query 무시, `/feedback` fallback,
  guest 비노출, dirty 확인, submitting 차단, success 연속 제출, focus·scroll 복원을 검증한다.
- overlay-only migration에서는 Web 직접 URL·새로고침과 Android·iOS 기존 route 진입이 새 overlay/sheet 계약으로
  수렴하고, 제거된 route로 별도 page가 렌더링되지 않는지 별도 Product 검증을 추가한다.
- `390px` sheet, `900px`·`1400px` dialog geometry와 body 내부 scroll을 실제 Web runtime에서 확인한다.
- keyboard focus trap, `Escape`, backdrop, background 차단을 확인한다.
- 자동화는 실제 Web reflow, focus indicator, contrast와 keyboard/document scroll 관찰을 대신하지 않는다.

## DSN-51 제외 범위

- `submitFeedback` mutation, Slack delivery payload와 인증 경계 변경
- `/feedback` route 제거와 Android/iOS overlay·sheet runtime 구현
- browser Back/Forward, reload, 주소 이동과 tab close의 dirty/submitting 이탈 보호
- URL 기반 overlay 복원 또는 deep link
- 범용 modal/router/history architecture 재설계

PROD-594는 기존 form과 `/feedback` page를 유지하면서 인증된 Web shell의 일시적인 overlay presentation만
추가했다. overlay-only Target은 이 완료 이슈를 변경하지 않고 별도 Product 이슈에서 호환 route 제거와 Native
presentation을 전달한다.
