## Context

`ProfileSwitcher`는 기존 셸 query의 `ProfileSwitcher_query` fragment에서 Account가 접근할 수 있는
`me.profiles`와 각 Profile option을 읽는다. PROD-643은 이 option에 서버가 이미 제공하는
`Profile.unreadNotificationCount`의 양수 여부를 표시하되, 정확한 count나 다른 Profile의 알림 내용을 노출하지
않는다.

기존 selected Profile 알림 badge는 현재 actor의 count와 알림 목록을 소유한다. picker의 12-unit boolean dot은
그 8px badge와 표시·접근성 목적과 geometry가 다르므로 badge component·controller 계약을 재사용하지
않는다. 단, 두 dot의 `accent`·원형·접근성 숨김 invariant만 presentation-only primitive로 공유한다.

## Goals / Non-Goals

**Goals:**

- selected/non-selected option 모두에 12 logical unit `accent` dot과 count 없는 접근성 상태를 제공한다.
- count `0` 또는 표시할 수 없는 Profile에는 잘못된 dot을 표시하지 않는다.
- 기존 Profile 선택 mutation, actor reset, 8px 셸 badge와 알림 목록 수렴을 보존한다.
- 기존 Relay fragment와 Store lifecycle을 그대로 사용한다.

**Non-Goals:**

- GraphQL schema·resolver, DB·migration 또는 dependency를 변경하지 않는다.
- 다른 Profile의 알림 내용·정확한 count를 표시하지 않는다.
- picker open 전용 refresh, retry, last-success snapshot 또는 request identity lifecycle을 추가하지 않는다.
- 기존 `UnreadNotificationBadge`의 8px geometry나 실제 count 접근성 계약을 변경하지 않는다.
- Profile 자동 전환·자동 읽음 처리, push·OS app icon badge 또는 realtime delivery를 추가하지 않는다.
- picker의 breakpoint별 surface, 목록 scroll, 선택·생성 흐름을 다시 설계하지 않는다.

## Implementation Guidance

### Current Constraints

- `ProfileSwitcher_query`가 이미 `me.profiles`의 identity, label과 avatar를 소유한다.
- `Profile.unreadNotificationCount`는 Account–Profile membership으로 접근 권한을 확인하는 기존 non-null
  필드이며 schema·resolver 변경이 필요 없다.
- Profile option은 surface에 따라 Web button·`menuitemradio` 또는 Native radio semantics를 사용한다.
  Unread 접근성 이름을 추가하면서 selected/disabled state와 role을 덮어쓰면 안 된다.

### Recommended Approach

1. 기존 `ProfileSwitcher_query`의 `me.profiles` selection에 `unreadNotificationCount`를 선언한다.
2. 각 option에서 `profile.unreadNotificationCount > 0`만 계산해 12-unit dot과 boolean 접근성 이름에 사용한다.
   별도 local snapshot이나 network lifecycle은 두지 않는다.
3. dot은 avatar wrapper 안의 absolute upper-right overlay로 두고 `accent` token과 원형 radius를 사용한다.
   모든 접근성 platform에서 dot 자체를 숨긴다.
4. presentation-only `UnreadDot`은 `accent`·원형·접근성 숨김만 소유한다. picker와 셸 badge
   호출부는 각각 표시 조건, 12/8px geometry, offset, test selector와 accessible name을 계속 소유한다.
5. 기존 display name과 relative handle을 유지하고, Unread가 있을 때만 `읽지 않은 알림 있음`을 option 이름에
   추가한다. selected/disabled state, role, press handler와 check는 그대로 둔다.
6. Storybook에서 0·양수·큰 count, selected/non-selected, geometry와 접근성 이름을 검증한다. Web E2E에서는 최신
   shell query를 받은 뒤 다른 Profile의 dot을 확인하고 선택해 기존 actor 재조회와 셸 badge·알림 목록 수렴을
   검증한다.

### Allowed Alternatives

- 공통 `UnreadDot` primitive는 semantic presentation invariant만 공유할 수 있다. 12 logical unit picker dot과
  8px 셸 badge의 geometry·test selector·visibility·accessible name 계약을 primitive prop으로 일반화하지
  않아야 한다.

### Known Traps

- selected Profile badge의 count를 모든 option에 복사하면 Profile별 상태가 섞인다.
- exact count를 option label에 넣거나 dot을 accessible element로 남기면 승인 범위 밖 숫자 또는 중복 상태를 읽는다.
- option 행 끝에 dot을 배치하면 selected check와 경쟁하거나 행 geometry를 바꿀 수 있다.
- unread 표시를 이유로 기존 Profile 선택·actor reset 흐름을 변경하면 알림 목록과 셸 badge 수렴이 깨진다.

## Risks / Trade-offs

- 기존 shell query가 다시 실행되기 전까지 Profile option의 count가 최신 서버 상태와 시차가 날 수 있다. 이 dot은
  상태 전이를 수행하는 control이 아니라 보조 존재 표시이며, 별도 picker refresh 비용과 lifecycle 복잡도를
  추가하지 않는 쪽을 선택한다.
- 12-unit overlay가 작은 avatar에서 경계를 벗어나거나 clip될 수 있다. compact, drawer, full, Android, iOS
  surface에서 위치와 행 geometry를 확인한다.

## Migration Plan

1. Storybook fixture가 기존 shell fragment의 count만으로 0·양수·큰 count 표시를 검증하게 한다.
2. `ProfileSwitcher_query`에 count를 추가하고 별도 query·snapshot·request guard를 제거한다.
3. Relay artifact를 갱신하고 app type/Storybook 검증을 실행한다.
4. Web E2E에서 최신 shell query 이후 dot → Profile 선택 → 기존 badge·알림 목록 수렴을 확인한다.
5. Web keyboard/screen reader, Android TalkBack, iOS VoiceOver에서 option 이름·selected state·touch target을 확인한다.
6. 문제가 있으면 fragment field와 picker presentation만 되돌린다. schema와 셸 badge는 변경하지 않으므로 데이터
   migration은 필요 없다.

## Open Questions

없음.
