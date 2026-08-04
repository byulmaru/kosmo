# 피드백 화면

인증된 Web 사용자의 피드백 화면은 KOSMO의 공용 페이지 위계 안에서 의견 종류와 내용을 입력하고 제출하는
집중된 폼을 제공한다. 제출 계약은 [PROD-487](https://linear.app/byulmaru/issue/PROD-487)에 따르고, 이 문서는
[PROD-547](https://linear.app/byulmaru/issue/PROD-547)의 Web 시각 구조와 후속
[PROD-594](https://linear.app/byulmaru/issue/PROD-594)를 위한 presentation 소유권 경계를 정한다.

## 정보 위계

- `/feedback` route는 공용 `PageHeader`의 `text` variant로 `피드백 보내기` 제목을 한 번 표시한다.
- 폼은 제목을 다시 표시하지 않고 `KOSMO를 더 좋게 만들 수 있도록 의견을 들려주세요.` 설명으로 시작한다.
- 설명 다음에는 피드백 종류, 피드백 내용, 제출 상태, primary action 순으로 배치한다.
- 피드백 종류는 outer card나 항목별 bordered card를 사용하지 않는 평면 목록이다. 항목 사이의 낮은 강도
  구분선과 선택된 행의 theme surface, radio indicator를 함께 사용해 선택 상태를 나타낸다. Web의 선택·누름
  surface는 공용 `radii.sm=8px` 반경을 사용하되 행 사이 간격이나 border를 추가하지 않아 카드 목록처럼
  분리하지 않는다.
- 피드백 내용은 공용 `TextField`의 multiline 입력을 사용하고, 입력 경계가 필요한 surface이므로 `border`
  token을 유지한다.
- `피드백 보내기` primary action은 폼의 전체 너비를 사용한다. 작은 독립 버튼이나 별도 action card로
  표현하지 않는다.
- 색상, 간격, 반경과 typography는 공용 theme token과 UI primitive를 사용한다. component-local hex나 새
  breakpoint를 만들지 않는다.

## 반응형 Page Surface

- Web `< compact`와 `compact` 이상 Web은 같은 정보 위계와 평면 폼을 사용한다.
- route가 `PageHeader`, document scroll, page padding과 중앙 콘텐츠 최대 폭을 소유한다. 폼은 route와 popup의
  chrome을 소유하지 않는다.
- `< compact`에서는 모바일 셸과 하단 탭을 유지하며 가용 중앙 폭을 사용한다. outer card를 추가하지 않는다.
- `compact`와 `full` Web에서는 기존 shell의 중앙 route column 안에 폼을 배치한다. 넓은 화면에서도 별도
  desktop card를 추가하지 않는다.
- breakpoint는 [breakpoints.md](./breakpoints.md)의 `compact=768`, `full=1280`을 그대로 사용한다.
- `PageHeader`의 높이, heading과 scroll 소유권은 [page-header.md](./page-header.md)를 따른다.

## Form과 Presentation 소유권

피드백 form은 입력, 검증, 제출과 결과 상태를 소유하되 자신이 page인지 popup인지 판단하지 않는다.

- form 소유: 피드백 종류와 본문 draft, validation, `submitFeedback` 호출, pending 입력 차단, 성공·실패 표시,
  성공 시 초기화와 실패 시 draft 유지
- page 소유: `PageHeader`, page padding, document scroll, 중앙 콘텐츠 폭
- 후속 popup 소유: dialog/sheet 제목, 닫기 action, 크기와 위치, backdrop, navigation과 browser history,
  뒤로가기와 `Escape`, focus trap·복원, 배경 상호작용 차단

[PROD-594](https://linear.app/byulmaru/issue/PROD-594)는 같은 form을 Web popup body에 조립한다. form은
`{dirty, submitting}` 상태만 presentation에 알리고 popup 전용 variant, navigation, 닫기 callback이나 history를
소유하지 않는다. popup의 모든 닫기 경로는 하나의 `requestClose` 경계를 사용한다.

Android와 iOS 피드백 화면은 PROD-547 범위가 아니다. 공용 form의 상태·제출 로직은 공유할 수 있지만 이번 Web
surface 변경으로 Native의 기존 page chrome이나 시각 구조를 바꾸지 않는다.

## Web Overlay

- Web의 full sidebar, compact icon rail과 mobile drawer에서 `피드백 보내기`를 실행하면 현재 pathname과 다른
  query를 보존한 채 `feedback=open` history entry를 push하고 shell 전체 위에 하나의 피드백 overlay를 연다.
- overlay는 `UniversalShell`의 sidebar, 중앙 route, right rail과 mobile chrome 전체를 덮되 기존 route tree와
  document scroll을 배경에 유지한다. desktop과 mobile navigation 안에 별도 overlay 인스턴스를 만들지 않는다.
- `/feedback` 직접 URL 접근과 새로고침은 기존 `PageHeader`와 page surface를 가진 보호 route fallback을
  유지한다. `/feedback` 위에는 query overlay를 중복 표시하지 않는다.
- `feedback=open` query가 있는 다른 shell route를 직접 열거나 새로고침하면 overlay를 복원한다. 이 fresh-load
  overlay는 현재 route의 query 없는 history entry를 뒤에 둬 browser back도 같은 document 안에서 처리한다.
  닫거나 dirty draft 폐기를 확인하면 이전 document로 이동하지 않고 현재 route에 남아 `feedback` query만
  제거한다. 이 단순 barrier는 닫힌 뒤 forward history에 남을 수 있으므로 browser forward가 초기화된 overlay를
  다시 열 수 있다.
- 사용자가 browser Back을 매우 빠르게 연속 실행해 단일 same-document barrier보다 여러 entry를 한 번에
  지나가면 Navigation API history index 제공 여부와 관계없이 현재 document의 `popstate` guard가 이전
  document 이탈을 가로채지 못할 수 있다. 이번 범위는 이 제한을 허용한다. 일반적인 단일 Back과 현재
  document의 `popstate`에서 관찰되는 단일 다단계 traversal은 기존 `requestClose` 정책으로 보호한다.
- shell 진입으로 연 overlay의 clean close는 push 전 history entry로 돌아간다. browser forward로 query entry를
  다시 방문하면 overlay를 다시 연다.
- 종류나 본문이 초기값에서 바뀐 dirty 상태의 close는 draft 폐기 확인을 거친다. 취소하면 overlay, query와
  draft를 유지하고, 확인하면 close source에 맞는 history 결과를 적용한다.
- 제출 중에는 닫기 버튼, backdrop, `Escape`와 browser back을 포함한 모든 close를 차단하고 overlay, query와
  form 상태를 유지한다.
- 성공 후에는 기존 성공 문구와 초기화된 form을 overlay 안에 유지해 여러 피드백을 이어서 보낼 수 있게 한다.
  실패 후에는 기존 오류·재시도와 draft를 유지한다.
- `< compact` Web에서는 viewport 아래에 붙는 bottom sheet, `compact` 이상 Web에서는 최대 약 `600px` 너비와
  `85dvh` 높이의 중앙 dialog로 표시한다. 두 surface 모두 form body만 가용 높이 안에서 내부 scroll한다.
- overlay는 `피드백 보내기` 제목과 accessible name이 있는 닫기 control을 제공하고 focus를 내부로 이동시킨다.
  열린 동안 focus를 가두고 배경 shell을 pointer, keyboard와 accessibility tree 상호작용에서 차단한다. 닫힌
  뒤에는 열기 직전의 유효한 focus target과 document scroll 위치를 복원한다.

## 상태와 동작 불변조건

- idle 상태는 기본 `좋아요` 종류와 빈 본문으로 시작하며, 유효한 본문이 입력되기 전 제출을 비활성화한다.
- validation error는 기존 body schema와 오류 문구를 유지한다.
- pending은 종류, 본문과 제출 action의 중복 입력을 차단하고 busy 상태를 유지한다.
- 성공은 기존 성공 문구를 표시하고 종류와 본문을 초기화한다.
- delivery failure와 GraphQL failure는 기존 오류 문구와 재시도 action을 표시하고 종류와 본문을 유지한다.
- `submitFeedback` mutation, Slack payload, route와 인증 경계, 기존 radio·status·busy semantics는 변경하지
  않는다.
- 재현 환경은 별도 필드로 수집하지 않는다. 사용자는 필요한 기기·플랫폼 정보를 피드백 본문에 함께 적을 수
  있으며, 자동 감지 metadata나 환경 선택값을 제출 계약에 추가하지 않는다.

## 검증

- Storybook에서 idle, validation error, pending, success, delivery failure와 실패 후 입력 유지를 확인한다.
- 각 상태의 page surface를 `390px` mobile, `900px` compact, `1400px` full Web viewport에서 확인한다.
- 실제 Web `/feedback`에서 `< compact`와 desktop viewport의 `PageHeader`, 평면 목록, multiline 입력과 full-width
  primary action을 확인한다.
- 첫 번째·중간·마지막 종류를 각각 선택해 8px 선택 surface, 구분선 연속성, 누름·keyboard focus 표시가 평면
  목록 위계를 유지하는지 확인한다.
- 기존 Web E2E로 인증된 진입, 제출 payload, 성공 초기화, 실패 후 입력 유지가 바뀌지 않았음을 검증한다.
- Web shell에서 현재 route query를 보존한 open, clean close와 browser back/forward, fresh-load barrier close,
  dirty 폐기 확인 뒤 현재 route 유지, submitting close 차단과 fresh-load close 뒤 forward 재진입을 검증한다.
- fresh-load overlay의 일반적인 단일 Back과 현재 document의 `popstate`에서 관찰되는 단일 다단계 traversal이
  `requestClose` 정책과 현재 route를 유지하는지 검증한다. 단일 barrier보다 여러 entry를 매우 빠르게 지나는
  연속 Back은 검증 범위가 아니다.
- `390px`에서 bottom sheet, `900px`와 `1400px`에서 중앙 dialog geometry와 body 내부 scroll을 확인한다.
- keyboard로 open, focus trap, `Escape`, 닫기 후 trigger focus·document scroll 복원과 배경 상호작용 차단을
  실제 Web runtime에서 확인한다.
- 자동화와 Storybook 결과는 실제 Web reflow, focus indicator, contrast와 keyboard/document scroll 관찰을
  대신하지 않는다.

## 제외 범위

- `submitFeedback` mutation과 Slack delivery payload 변경
- 기기·플랫폼 자동 감지 metadata와 재현 환경 선택 필드
- `/feedback` route 및 인증 경계 변경
- Android/iOS 피드백 화면 변경
- PROD-487이 소유한 접근성 semantics 재설계
- 단일 barrier보다 여러 entry를 매우 빠르게 지나는 Back 이탈을 막기 위한 `beforeunload` native prompt, raw
  history marker·자동 압축 또는 복수 same-document barrier 일반화

PROD-547은 새 사용자 행동이나 제출 계약을 추가하지 않고 기존 행동을 보존한 채 Web 시각 구조를 정리했다.
PROD-594는 그 form과 `/feedback` page를 유지하면서 Web shell의 query-backed overlay navigation과 lifecycle만
추가한다.
