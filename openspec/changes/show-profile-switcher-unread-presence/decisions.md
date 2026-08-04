## Context

이 로그는 `PROD-643`의 확정된 표시·상태 계약과 `docs/design/breakpoints.md`의 Web·Android·iOS 공통 Profile
picker Unread 계약을 구현 가능한 경계로 기록한다. Notification visibility, 접근성, color authority와 기존 selected
Profile 셸 badge의 독립 계약도 함께 반영한다.

## Decision Records

### selected Profile을 포함한 avatar 우상단 12-unit 존재 표시

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
  `docs/design/colors.md`, `PROD-643`
- Status: Active
- Context / Problem: 사용자는 Profile을 전환하기 전에 다른 Profile에 Unread가 있는지 알 수 없으며, selected
  Profile도 picker option으로 같은 상태를 일관되게 보여야 한다.
- Decision Outcome: Web·Android·iOS의 selected/non-selected Profile option 아바타 우상단에
  `unreadNotificationCount > 0`일 때만 숫자 없는 12 logical unit `accent` dot을 표시한다. dot은 행 geometry와
  기존 selected check를 바꾸지 않는다.
- Alternatives Considered: 8px dot은 기존 navigation icon badge와 구분이 약해 거절했다. option 행 끝 표시는
  selected check와 경쟁해 거절했다. selected Profile 제외는 picker 내부 일관성을 깨므로 거절했다.
- Consequences: 32px와 48px avatar 모두에서 overlay geometry를 검증해야 하며 compact, drawer, full,
  Android, iOS surface에서 layout 회귀를 확인해야 한다.
- Confirmation / Follow-up: Storybook visual/interaction과 platform별 수동 QA에서 위치·크기·행 target을 확인한다.

### dot은 숨기고 option에 boolean 접근성 상태를 추가한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `PROD-643`
- Status: Active
- Context / Problem: 숫자 없는 시각 dot을 별도 accessibility element로 노출하면 중복 focus가 생기고, 다른
  Profile의 정확한 count를 읽으면 승인 범위를 넘어선다.
- Decision Outcome: dot은 접근성 트리와 focus 순서에서 숨긴다. Profile option accessible name은 기존 display
  name과 handle을 유지하고 Unread가 있을 때만 `읽지 않은 알림 있음`을 추가한다. selected/disabled state와
  option role은 독립적으로 유지한다.
- Alternatives Considered: exact count 읽기는 이번 picker의 존재 표시 범위를 넘어 거절했다. dot 자체 label은
  중복 탐색을 만들므로 거절했다. 시각 표시만 제공하는 방식은 screen reader 사용자가 상태를 알 수 없어 거절했다.
- Consequences: Profile option이 명시적 accessible name을 갖게 되므로 기존 role·selected state가 덮이지 않는지
  Web screen reader, TalkBack, VoiceOver에서 확인해야 한다.
- Confirmation / Follow-up: 큰 count가 숫자로 읽히지 않는지와 dot이 별도 element가 아닌지를 자동화하고,
  platform 수동 QA에서 읽기 순서를 확인한다.

### picker open의 별도 non-suspending network operation을 사용한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-643`
- Status: Active
- Context / Problem: 기존 suspending shell/ProfileSwitcher fragment에 Profile별 count를 결합하면 count 조회의
  loading·오류가 전체 셸과 picker 사용을 막을 수 있다.
- Decision Outcome: picker를 열 때 현재 Account의 `me.profiles { id unreadNotificationCount }`를 별도 Relay
  network operation으로 갱신한다. 요청은 suspending render 경로 밖에서 수행하고 picker 표시·선택과 전체 셸
  error/loading boundary로 전파하지 않는다.
- Alternatives Considered: 기존 ProfileSwitcher fragment 확장은 오류 경계 분리를 위반해 거절했다. selected
  Profile badge controller 재사용은 단일 actor count와 다중 option 존재 상태의 수명이 달라 거절했다. picker
  mount 때 상시 조회는 닫힌 상태의 불필요한 요청을 만들어 거절했다.
- Consequences: picker open마다 추가 operation이 발생하며 Storybook mock과 Relay generated artifact를 추가해야
  한다. 전용 loading·error UI나 retry control은 만들지 않는다.
- Confirmation / Follow-up: 최초 loading/error에도 picker 선택이 가능하고 전체 셸 오류가 발생하지 않는지
  interaction test로 확인한다.

### 성공 snapshot을 Profile ID별 boolean으로 원자 교체한다

- Decision Date: 2026-08-04
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/domain/objects/notification.md`, `PROD-643`
- Status: Active
- Context / Problem: UI는 count 존재만 필요하지만 refresh 오류에는 같은 Profile의 마지막 성공 상태를 유지하고,
  다음 성공에서 더 이상 접근할 수 없는 Profile을 제거해야 한다.
- Decision Outcome: 성공 응답을 현재 Account의 `{ Profile ID -> hasUnread }` boolean snapshot으로 즉시 축소해
  전체 교체한다. 최초 성공 전에는 snapshot이 없고, 오류는 기존 snapshot을 변경하지 않으며, 성공 응답에 없는
  Profile ID는 새 snapshot에서 제거한다.
- Alternatives Considered: exact count map 보관은 UI가 필요로 하지 않는 데이터를 오래 유지해 거절했다. 성공
  응답을 이전 map에 merge하는 방식은 unavailable Profile의 stale dot을 남겨 거절했다. 오류 시 빈 map 교체는
  마지막 성공 보존 계약을 위반해 거절했다.
- Consequences: count 변화가 양수 사이에서 일어나도 UI snapshot은 같은 boolean으로 유지된다. 상태 변환과
  성공/오류 교체 semantics를 순수 unit test로 고정해야 한다.
- Confirmation / Follow-up: 0/양수, 큰 count, 최초 상태, refresh failure와 성공 응답 누락을 unit/interaction
  test로 확인한다.

### Account·actor generation·open request version을 함께 검사한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `PROD-643`
- Status: Active
- Context / Problem: actor environment 교체와 Account 변경뿐 아니라 같은 environment에서 picker를 닫고 다시
  여는 경우에도 이전 요청 완료가 새 상태를 덮을 수 있다.
- Decision Outcome: 요청은 시작 시 Account ID, environment identity, environment generation과 단조 증가하는
  open request version에 귀속한다. close, reopen, Account 변경과 environment 교체 시 이전 요청을 취소하고
  version을 무효화하며, 네 guard가 모두 현재 값과 일치하는 완료만 적용한다. Account 변경에는 이전 snapshot도
  제거한다.
- Alternatives Considered: unsubscribe만 신뢰하는 방식은 queued callback을 충분히 방어하지 못해 거절했다.
  environment identity만 비교하는 방식은 같은 environment의 close/reopen을 구분하지 못해 거절했다. actor
  generation만 비교하는 방식은 Account와 open 수명을 명시하지 못해 거절했다.
- Consequences: 요청 effect와 성공 callback에 여러 guard가 필요하지만 Profile 교차 노출과 race를 명시적으로
  차단한다. 같은 Account의 refresh와 actor 교체 중 last-success snapshot은 새 성공까지 보존할 수 있다.
- Confirmation / Follow-up: close/reopen, actor 교체, Account 교체 뒤 늦은 완료를 순서 제어 test로 검증한다.

### picker 존재 상태와 기존 8px 셸 badge를 분리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
  `docs/design/colors.md`, `PROD-643`
- Status: Active
- Context / Problem: 기존 navigation badge는 selected Profile의 8px dot과 실제 count accessible name을
  제공하지만, picker는 모든 Profile의 12-unit dot과 boolean accessible name을 요구한다.
- Decision Outcome: picker 표시·상태는 기존 셸 badge 컴포넌트와 controller를 재사용하지 않는다. Profile 선택
  성공 뒤 기존 `resetActor`, 셸 badge와 알림 목록의 서버 재조회 수렴 계약은 변경하지 않는다.
- Alternatives Considered: 기존 badge에 size와 mode를 추가하는 일반화는 서로 다른 상태 소유권과 접근성 계약을
  한 컴포넌트에 결합해 거절했다. picker snapshot을 셸 badge count로 사용하는 방식은 exact count와 selected
  Profile 격리를 잃어 거절했다.
- Consequences: 작은 picker 전용 presentation이 추가되지만 기존 badge 회귀 위험이 줄어든다. Profile 전환 E2E는
  picker dot에서 기존 selected Profile badge/list 수렴까지 경계를 가로질러 확인해야 한다.
- Confirmation / Follow-up: 기존 badge 자동 검증을 유지하고 Profile 전환 E2E에서 새 actor의 셸 query와 badge,
  알림 목록 수렴을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
