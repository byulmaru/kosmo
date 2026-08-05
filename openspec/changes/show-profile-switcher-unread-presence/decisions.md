## Context

이 로그는 `PROD-643`과 `docs/design/breakpoints.md`의 Profile picker Unread 표시·접근성 계약을 구현 가능한
경계로 기록한다. 기존 selected Profile 셸 badge의 독립 계약도 함께 반영한다.

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

### picker 존재 상태와 기존 8px 셸 badge를 분리한다

- Decision Date: 2026-08-04
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
  `docs/design/colors.md`, `PROD-643`
- Status: Active
- Context / Problem: 기존 navigation badge는 selected Profile의 8px dot과 실제 count accessible name을
  제공하지만, picker는 모든 Profile의 12-unit dot과 boolean accessible name을 요구한다.
- Decision Outcome: picker는 기존 셸 badge 컴포넌트와 controller를 재사용하지 않는다. 두 dot은
  `accent`·원형·접근성 숨김만 presentation-only `UnreadDot`으로 공유하고, 표시 조건·geometry·selector와
  accessible name은 각 호출부가 소유한다. Profile 선택 성공 뒤 기존 `resetActor`, 셸 badge와 알림 목록의
  서버 재조회 수렴 계약은 변경하지 않는다.
- Alternatives Considered: 기존 badge에 size와 mode를 추가하는 일반화는 서로 다른 표시와 접근성 계약을 한
  컴포넌트에 결합해 거절했다. picker 존재 표시를 셸 badge count로 사용하는 방식은 exact count와 selected
  Profile 격리를 잃어 거절했다.
- Consequences: 작은 semantic primitive가 추가되지만 두 consumer의 geometry와 접근성 label 계약은 분리된다.
- Confirmation / Follow-up: 기존 badge 자동 검증을 유지하고 Profile 전환 E2E에서 새 actor의 badge와 알림 목록
  수렴을 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### 별도 Unread query와 last-success request lifecycle

- Original Decision Date: 2026-08-04
- Superseded Date: 2026-08-05
- Decision Class: Implementation Choice
- Previous Outcome: picker open마다 별도 non-suspending Relay query를 실행하고, 임시 Store의 boolean
  last-success snapshot과 Account·environment·generation·request-version guard로 결과를 관리한다.
- Superseded By: 기존 `ProfileSwitcher_query`가 소유한 `me.profiles[].unreadNotificationCount`를 선언해
  option에서 양수 여부를 직접 표시한다.
- Reason: 원래 Linear 제품 요구사항은 별도 refresh lifecycle을 요구하지 않았고, PR #506 리뷰에서 해당 필드가
  Account가 접근 가능한 Profile Node의 정상 데이터이며 기존 Relay fragment·Store lifecycle을 재사용할 수
  있음이 확인됐다.
- Consequences: 전용 query, 임시 Environment/Store, last-success snapshot, request identity helper와 lifecycle
  테스트를 제거한다. dot은 기존 shell query가 다시 실행될 때 최신 서버 상태로 수렴한다.
