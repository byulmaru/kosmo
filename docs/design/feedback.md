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
  구분선과 선택된 행의 theme surface, radio indicator를 함께 사용해 선택 상태를 나타낸다.
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

[PROD-594](https://linear.app/byulmaru/issue/PROD-594)는 같은 form을 popup body에 조립한다. 현재 page 작업은
아직 결정되지 않은 popup 전용 `variant`, 닫기 callback이나 성공 후 자동 닫기 정책을 form에 미리 추가하지
않는다. popup 성공 후 유지·닫기 정책과 `/feedback` route의 fallback·deep-link 역할은 PROD-594에서 결정한다.

Android와 iOS 피드백 화면은 PROD-547 범위가 아니다. 공용 form의 상태·제출 로직은 공유할 수 있지만 이번 Web
surface 변경으로 Native의 기존 page chrome이나 시각 구조를 바꾸지 않는다.

## 상태와 동작 불변조건

- idle 상태는 기본 `좋아요` 종류와 빈 본문으로 시작하며, 유효한 본문이 입력되기 전 제출을 비활성화한다.
- validation error는 기존 body schema와 오류 문구를 유지한다.
- pending은 종류, 본문과 제출 action의 중복 입력을 차단하고 busy 상태를 유지한다.
- 성공은 기존 성공 문구를 표시하고 종류와 본문을 초기화한다.
- delivery failure와 GraphQL failure는 기존 오류 문구와 재시도 action을 표시하고 종류와 본문을 유지한다.
- `submitFeedback` mutation, Slack payload, route와 인증 경계, 기존 radio·status·busy semantics는 변경하지
  않는다.

## 검증

- Storybook에서 idle, validation error, pending, success, delivery failure와 실패 후 입력 유지를 확인한다.
- 각 상태의 page surface를 `390px` mobile, `900px` compact, `1400px` full Web viewport에서 확인한다.
- 실제 Web `/feedback`에서 `< compact`와 desktop viewport의 `PageHeader`, 평면 목록, multiline 입력과 full-width
  primary action을 확인한다.
- 기존 Web E2E로 인증된 진입, 제출 payload, 성공 초기화, 실패 후 입력 유지가 바뀌지 않았음을 검증한다.
- 자동화와 Storybook 결과는 실제 Web reflow, focus indicator, contrast와 keyboard/document scroll 관찰을
  대신하지 않는다.

## 제외 범위

- `submitFeedback` mutation과 Slack delivery payload 변경
- `/feedback` route 및 인증 경계 변경
- PROD-594가 소유하는 popup 진입, shell navigation과 dialog/sheet lifecycle
- Android/iOS 피드백 화면 변경
- PROD-487이 소유한 접근성 semantics 재설계

PROD-547은 새 사용자 행동이나 제출 계약을 추가하지 않고 기존 행동을 보존한 채 Web 시각 구조를 정리한다.
따라서 별도 OpenSpec change를 만들지 않고, 기존 `web-app-shell`의 피드백 진입과 `/feedback` 보존 계약을
유지한다. PROD-594가 popup의 navigation·lifecycle 행동을 확정할 때 필요한 OpenSpec 범위를 별도로 판단한다.
