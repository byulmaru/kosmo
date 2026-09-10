## Context

`ProfileSwitcher_query`는 Account가 접근할 수 있는 `me.profiles`와 각 Profile의 서버 제공
`unreadNotificationCount`를 이미 읽는다. PROD-643은 이 값을 열린 picker의 avatar dot에 연결했고,
PROD-855는 DSN-40의 최신 closed·opened presentation을 `ProfileSwitcherTarget`과 Storybook에 구현했다.
PROD-786은 새 query나 상태 lifecycle 없이 이 최신 presentation을 실제 `ProfileSwitcher`와 공용
`ProfilePicker`에 연결한다.

`ProfilePicker`는 Shell ProfileSwitcher와 Post Composer가 공유한다. Composer fixture는 Unread count를
전달하지 않으므로 badge가 나타나지 않아야 하며, 이번 변경은 Composer의 선택·실패·focus 동작을 바꾸지 않는다.
기존 selected Profile 알림 badge는 현재 actor의 Relay fragment count와 알림 목록이 소유한다. picker의
indicator와 badge는 이 8px badge presentation이나 별도 React controller·last-success snapshot을 재사용하지 않고,
각 Profile의 현재 Relay field만 사용한다.

## Goals / Non-Goals

**Goals:**

- 닫힌 trigger에서 selected Profile을 제외한 Other Unread 존재를 표시한다.
- 열린 picker에서 non-selected Profile의 정확한 count를 `1`~`9` 또는 `9+`로 표시한다.
- indicator·badge를 접근성 트리에서 숨기고 option에는 boolean Unread 상태만 전달한다.
- 기존 Profile 생성·선택, navigation guard, actor reset과 selected Profile 알림 격리를 보존한다.

**Non-Goals:**

- GraphQL count 계약은 membership field 오류가 visible Profile object 전체를 null bubble하지 않도록
  `Profile.unreadNotificationCount`를 nullable로 유지한다. DB·migration 또는 dependency를 변경하지 않는다.
- picker open 전용 refresh, retry, snapshot 또는 request identity lifecycle을 추가하지 않는다.
- selected Profile 셸 badge, 알림 목록, Push·OS badge 또는 realtime delivery를 재구현하지 않는다.
- ProfileSwitcher 전체 구조를 Target으로 교체하거나 ProfilePicker 공개 API를 미래 용도로 일반화하지 않는다.

## Implementation Guidance

### Current Constraints

- `ProfileSwitcher_query.me.profiles[].unreadNotificationCount`는 이미 Relay artifact에 포함돼 있다.
- `Profile.unreadNotificationCount`가 `null`이거나 제공되지 않으면 해당 indicator와 badge를 숨기되 visible Profile
  option은 유지한다. UI는 현재 Profile의 colocated Relay field만 읽고 다른 Profile count나 last-success snapshot을
  재사용하지 않는다.
- `ProfileSwitcher`는 profile summary, create form, navigation guard, modal과 actor reset을 함께 소유하지만
  `ProfileSwitcherTarget`은 presentation-only trigger와 list만 소유한다.
- 닫힌 indicator는 selected Profile의 shell badge와 중복되지 않도록 `profile.id !== selectedProfileId`인
  Profile만 검사해야 한다.
- selected row는 기존 check를 유지하고 count badge를 동시에 표시하지 않는다.

### Recommended Approach

1. Target과 Production trigger 모두 `profiles.some(profile.id !== selectedProfileId && count > 0)`에서
   Other Unread를 파생한다.
2. 닫힌 non-compact trigger의 20px chevron wrapper에 8px dot을 배치하고 compact avatar wrapper에는
   canvas 1px halo가 있는 12px dot을 배치한다. `open=true`이면 둘 다 렌더링하지 않는다.
3. `ProfilePicker`의 기존 avatar dot을 제거하고 trailing 24px slot에서 non-selected 행의 숫자 badge 또는
   selected check 중 하나만 렌더링한다.
4. count가 양수인 option의 accessible name은 기존 boolean 문구를 유지하고 indicator·badge 자체는 숨긴다.
5. Target Storybook은 selected count `0`, other count 양수 fixture로 closed indicator의 source를 검증한다.
   Production Shell Storybook과 Web E2E는 closed indicator → open numeric badge → 기존 actor·notification
   수렴을 검증한다.

### Allowed Alternatives

- 같은 semantic token과 geometry를 유지한다면 indicator·badge의 작은 presentation helper를 재사용할 수 있다.
  현재 consumer 수와 단순 markup만으로 별도 public component를 만들 필요는 없다.

### Known Traps

- selected Profile count로 closed indicator를 계산하면 Other Unread가 없을 때 selected shell badge와 중복되고,
  다른 Profile에만 Unread가 있을 때 표시가 누락된다.
- selected row에 badge와 check를 함께 표시하면 canonical trailing geometry와 충돌한다.
- exact count를 accessible name에 넣거나 badge를 accessible element로 남기면 시각적 축약과 중복 announcement가
  생긴다.
- Target을 Production component 전체와 교체하면 create form, profile summary, modal과 navigation guard lifecycle을
  잃는다.

## Risks / Trade-offs

- 기존 shell query가 다시 실행되기 전까지 count에 시차가 날 수 있다. 별도 refresh lifecycle을 추가하지 않고
  기존 Relay source of truth에 수렴한다.
- `ProfilePicker`가 공유 component이므로 Composer 회귀 가능성이 있다. Unread count가 없는 Composer에서는
  빈 trailing slot만 남고 선택·focus 동작은 유지되는지 기존 Storybook 검증으로 확인한다.

## Migration Plan

1. OpenSpec의 PROD-643 avatar-dot 계약을 최신 canonical·PROD-786 계약으로 supersede한다.
2. Target의 Other Unread 계산을 바로잡고 Storybook fixture를 정렬한다.
3. Production trigger와 ProfilePicker presentation을 최소 변경한다.
4. nullable Relay field와 parent Profile identity 보존을 포함한 API·Relay/type, Storybook tests/build, targeted Web
   E2E와 OpenSpec strict validation을 실행한다.
5. Web에서 full·compact closed/open geometry와 keyboard·focus를 시각·상호작용 확인한다. Android/iOS runtime과
   assistive technology를 실행하지 못하면 미확인으로 남기고 change를 archive하지 않는다.
6. 문제가 있으면 presentation과 tests/spec 변경만 되돌린다. data migration은 없다.

## Open Questions

없음.
