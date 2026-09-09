## Context

이 로그는 PROD-643에서 시작한 Profile picker Unread 표시를 DSN-40·PROD-855·PROD-786의 최신
ProfileSwitcher 계약으로 갱신한다. selected Profile 셸 badge와 Profile 전환 lifecycle은 독립 계약으로 유지한다.

## Decision Records

### 닫힌 trigger는 Other Unread 존재만 표시한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
  `docs/design/colors.md`, `DSN-40`, `PROD-786`
- Status: Active
- Context / Problem: 사용자는 picker를 열기 전에 다른 Profile의 Unread 존재를 알아야 하지만 selected Profile의
  Unread는 기존 shell notification badge가 이미 표시한다.
- Decision Outcome: selected Profile을 제외한 접근 가능한 Profile 중 `unreadNotificationCount > 0`인 항목이
  하나라도 있을 때만 닫힌 trigger indicator를 표시한다. `full`·`drawer`는 20px chevron 옆 8px
  `action/primary/base` dot, `compact`는 40px avatar 우상단의 canvas 1px halo가 있는 12px dot을 사용한다.
  picker가 열리면 닫힌 indicator를 숨긴다.
- Alternatives Considered: selected Profile count 사용은 기존 shell badge와 중복되고 Other Unread 목적을
  충족하지 못해 제외했다. 모든 count를 합산하거나 client에서 보정하는 방식은 Profile별 서버 ownership을
  흐려 제외했다.
- Consequences: selected Profile에만 Unread가 있으면 ProfileSwitcher closed indicator는 숨겨지고 기존 shell
  badge만 남는다.
- Confirmation / Follow-up: selected count `0`, other count 양수 fixture와 실제 Shell query로 source와
  open/closed 중복 방지를 검증한다.

### 열린 picker는 non-selected 행에 숫자 badge를 표시한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/colors.md`, `DSN-40`, `PROD-786`
- Status: Active
- Context / Problem: 최신 picker는 Profile별 Unread 존재뿐 아니라 작은 범위의 count를 비교할 수 있어야 하며,
  selected 행의 기존 check와 trailing geometry를 보존해야 한다.
- Decision Outcome: Unread가 있는 non-selected Profile 행 오른쪽 24px slot에 `1`~`9` 또는 `9+` badge를
  표시한다. selected 행은 count와 무관하게 기존 check만 표시하고 count `0`인 non-selected 행은 slot을 비운다.
  badge는 `action/primary/base`, `action/primary/on-base`, `ui/label/s`를 사용한다.
- Alternatives Considered: avatar dot은 최신 숫자 계약을 표현하지 못해 supersede했다. selected 행에 badge와
  check를 함께 표시하는 방식은 canonical 계약과 trailing geometry를 깨므로 제외했다.
- Consequences: 시각적 `9+`는 실제 count의 축약이며 data나 접근성 값을 변경하지 않는다.
- Confirmation / Follow-up: 0·1·9·10 이상과 selected/non-selected 조합을 Storybook과 Web E2E에서 검증한다.

### 정확한 count 표시는 presentation에 한정하고 기존 lifecycle을 유지한다

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
  `docs/domain/objects/notification.md`, `PROD-643`, `PROD-786`
- Status: Active
- Context / Problem: 숫자 badge가 새 data fetch, Profile 격리 변경 또는 중복 accessibility element를 만들면
  기존 알림 수렴 계약을 깨뜨릴 수 있다.
- Decision Outcome: 기존 `ProfileSwitcher_query.me.profiles[].unreadNotificationCount`만 사용한다. closed
  indicator와 open badge 자체는 접근성 트리에서 숨기고 Profile option에는 count 없는
  `읽지 않은 알림 있음`만 추가한다. Profile 생성·선택, navigation guard, actor reset, selected Profile shell
  badge와 알림 목록 수렴을 변경하지 않는다.
- Alternatives Considered: 별도 picker refresh와 exact count announcement는 승인 범위 밖이므로 제외했다.
- Consequences: shell query 재실행 전에는 표시가 서버 최신 상태와 시차가 날 수 있으며 기존 Relay 수렴에 맡긴다.
- Confirmation / Follow-up: Profile 전환 E2E와 기존 notification regression을 유지한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

### selected Profile을 포함한 avatar 우상단 12-unit 존재 표시

- Original Decision Date: 2026-08-04
- Superseded Date: 2026-09-09
- Previous Outcome: 열린 picker의 selected/non-selected Profile avatar 우상단에 숫자 없는 12-unit dot을
  표시한다.
- Superseded By: 닫힌 Other Unread indicator와 열린 non-selected 숫자 badge 계약.
- Reason: DSN-40과 PROD-786이 ProfileSwitcher의 최신 closed·opened presentation을 확정했다.

### picker 존재 상태와 기존 8px 셸 badge의 avatar-dot presentation 공유

- Original Decision Date: 2026-08-04
- Superseded Date: 2026-09-09
- Previous Outcome: picker와 shell badge가 `UnreadDot` primitive의 원형·색·접근성 숨김을 공유한다.
- Superseded By: ProfilePicker의 24px 숫자 badge와 closed trigger별 indicator markup.
- Reason: 최신 picker는 숫자와 `action/primary` tokens를 사용하므로 기존 숫자 없는 avatar dot primitive와
  presentation 계약이 다르다.

### 별도 Unread query와 last-success request lifecycle

- Original Decision Date: 2026-08-04
- Superseded Date: 2026-08-05
- Previous Outcome: picker open마다 별도 query와 last-success snapshot을 관리한다.
- Superseded By: 기존 `ProfileSwitcher_query.me.profiles[].unreadNotificationCount` 재사용.
- Reason: 새 lifecycle 없이 기존 Relay ownership으로 요구사항을 충족할 수 있다.
