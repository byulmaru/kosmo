## Context

`ProfileSwitcher`는 현재 suspending 셸 fragment의 `me.profiles`에서 Profile identity와 avatar를 읽고, Profile
선택 성공 뒤 `resetActor`로 Relay environment를 교체한다. selected Profile의 알림 navigation badge는 별도
non-suspending controller가 `Profile.unreadNotificationCount`를 조회하고 있으나, 이 상태는 현재 actor의 selected
Profile 한 개에만 귀속되며 실제 count를 접근성 이름에 제공한다.

PROD-643은 기존 셸 badge와 알림 목록의 Profile 격리를 유지하면서 picker에 보이는 모든 접근 가능 Profile의
Unread **존재 여부**를 추가한다. Profile 목록을 제공하는 기존 fragment를 suspending count query로 확장하면 picker
open이 전체 셸의 loading/error boundary에 결합되고, actor 교체나 close/reopen 사이의 늦은 응답이 새 상태를 덮을
수 있다. 따라서 별도 요청 수명과 Account별 마지막 성공 상태가 필요하다.

## Goals / Non-Goals

**Goals:**

- picker open 시 현재 Account의 Profile별 `unreadNotificationCount`를 비차단으로 갱신한다.
- selected/non-selected option 모두에 12 logical unit `accent` dot과 count 없는 접근성 상태를 제공한다.
- 최초 실패는 조용히 숨기고, 같은 Account·Profile ID의 마지막 성공 상태만 안전하게 유지한다.
- close/reopen, Account 변경과 actor environment 교체 뒤 늦은 응답을 무시한다.
- 기존 Profile 선택 mutation, actor reset, 8px 셸 badge와 알림 목록 수렴을 보존한다.

**Non-Goals:**

- GraphQL schema·resolver, DB·migration 또는 dependency를 변경하지 않는다.
- 다른 Profile의 알림 내용·정확한 count를 표시하지 않는다.
- 기존 `UnreadNotificationBadge`의 8px geometry나 실제 count 접근성 계약을 변경하지 않는다.
- Profile 자동 전환·자동 읽음 처리, push·OS app icon badge 또는 realtime delivery를 추가하지 않는다.
- picker의 breakpoint별 surface, 목록 scroll, 선택·생성 흐름을 다시 설계하지 않는다.

## Implementation Guidance

### Current Constraints

- `ProfileSwitcher`의 기존 `me.profiles` fragment는 셸 query에 포함되어 있다. 여기에 count를 직접 추가하면 이번
  기능의 오류와 loading을 기존 셸 경계에서 분리하기 어렵다.
- 기존 selected Profile badge controller는 단일 Profile count와 normalized record 구독을 전제로 한다. 이를
  다중 Profile picker 상태에 재사용하면 8px/12px 표시와 exact-count/boolean 접근성 계약이 섞인다.
- `resetActor`는 environment와 generation을 교체한다. environment identity만 비교하면 같은 environment 안에서의
  close/reopen 늦은 완료를 구분할 수 없고, request unsubscribe만으로 완료 callback이 절대 실행되지 않는다고
  가정해서도 안 된다.
- `useSession`은 Account ID를, Relay environment boundary는 mutable generation ref를 제공한다. 두 값과 각 open
  요청 version을 함께 검사해야 Account 교체와 같은 environment의 재요청을 모두 격리할 수 있다.
- Profile option은 surface에 따라 Web button·`menuitemradio` 또는 Native radio semantics를 사용한다. Unread
  접근성 이름을 추가하면서 현재 selected/disabled state와 role을 덮어쓰면 안 된다.

### Recommended Approach

1. Profile별 응답을 `{ profileId -> hasUnread }` 형태의 원자적 last-success snapshot으로 변환하는 작은 순수 상태
   경계를 둔다. 숫자는 `> 0` boolean으로 즉시 축소하고 UI 상태에 exact count를 보관하지 않는다. 성공 응답은
   전체 map을 교체해 누락된 Profile을 제거하며, 오류는 기존 snapshot을 변경하지 않는다.
2. picker가 열릴 때 `me { id profiles { id unreadNotificationCount } }`를 조회하는 별도 Relay
   `network-only` operation을 시작한다. `fetchQuery` 구독은 suspending render 경로 밖의 effect에서 관리하고,
   오류 UI나 전용 retry control 없이 기존 picker를 계속 사용할 수 있게 한다.
3. 요청 시작 시 Account ID, environment identity, environment generation 값과 단조 증가하는 open-request version을
   캡처한다. effect cleanup에서 요청을 unsubscribe하고 version을 무효화한다. 성공 callback은 네 guard가 모두
   현재 값과 일치할 때만 snapshot을 교체한다. close 때 같은 Account의 last-success snapshot은 지우지 않되,
   Account가 바뀌거나 session이 무효가 되면 즉시 제거한다.
4. Profile option의 `hasUnread`는 현재 Account snapshot에서 같은 Profile ID를 찾을 때만 true로 계산한다. 최초
   성공 snapshot이 없거나 Profile이 빠졌으면 false다. refresh loading·실패에는 같은 Account의 기존 snapshot을
   유지하고, 다음 성공이 오면 원자적으로 교체한다.
5. 기존 8px 셸 badge 컴포넌트를 확장하지 않고 ProfileSwitcher 전용 12 logical unit presentation을 avatar wrapper
   안에 둔다. dot은 `accent` token, 원형 radius, absolute upper-right overlay를 사용하고 모든 접근성 플랫폼에서
   숨긴다. wrapper는 Profile 행 geometry와 avatar label을 바꾸지 않는다.
6. Profile option의 접근성 이름은 기존 display name과 relative handle을 명시적으로 유지하고, `hasUnread`일 때만
   `읽지 않은 알림 있음`을 추가한다. 기존 selected/disabled state, role, press handler와 check는 그대로 둔다.
7. 순수 snapshot 변환·visible-state·요청 guard를 unit test로 먼저 고정한다. Storybook interaction에서 0/양수,
   selected/non-selected, 큰 count, 최초 loading/error, refresh failure, 성공 누락과 접근성 이름을 검증한다.
   Web E2E에서는 다른 Profile의 dot을 본 뒤 해당 Profile을 선택해 기존 actor 재조회와 셸 badge·알림 목록이 새
   selected Profile로 수렴하는 경로를 검증한다.

### Allowed Alternatives

- 상태 변환과 request guard를 `ProfileSwitcher` 내부의 작은 hook으로 두거나 인접 순수 helper와 controller로
  분리할 수 있다. 어느 쪽이든 별도 non-suspending query, Account/Profile 격리, 원자적 성공 교체와 stale 완료
  무시를 독립 검증해야 한다.
- 12 logical unit dot은 ProfileSwitcher 내부의 작은 presentation 또는 Profile picker 전용 컴포넌트로 둘 수
  있다. 기존 8px 셸 badge의 기본 geometry·test selector·exact-count 계약을 바꾸지 않아야 한다.

### Known Traps

- 기존 `ProfileSwitcher_query`에 `unreadNotificationCount`만 추가하면 별도 network refresh와 오류 격리가
  사라지므로 허용되지 않는다.
- 기존 selected badge controller의 count를 모든 option에 복사하거나 현재 selected Profile 값으로 fallback하면
  Profile 격리가 깨진다.
- 오류 시 빈 map으로 교체하면 refresh failure 보존 계약을 위반하고, 성공 응답을 이전 map에 merge하면 응답에서
  사라진 Profile이 stale dot으로 남는다.
- environment identity 또는 unsubscribe 하나만 stale guard로 사용하면 같은 environment close/reopen과 이미
  queued된 callback을 막지 못할 수 있다.
- dot을 `accessible` element로 남기거나 exact count를 option label에 넣으면 screen reader가 중복 또는 승인되지
  않은 숫자를 읽는다.

## Risks / Trade-offs

- [picker open마다 추가 network operation이 발생한다] → open 단위 한 요청만 유지하고 close cleanup으로 중복
  subscription을 제거한다. count는 existing API field를 사용해 서버 계약을 늘리지 않는다.
- [마지막 성공 boolean은 refresh 실패 동안 잠시 오래될 수 있다] → 같은 Account·Profile ID에만 제한하고 다음
  성공 응답에서 전체 교체한다. 최초 성공이 없으면 표시하지 않는다.
- [12-unit overlay가 작은 avatar에서 경계를 벗어나거나 clip될 수 있다] → avatar wrapper의 overflow와 compact,
  drawer, full, Android, iOS surface를 시각 검증하고 행 geometry 회귀를 확인한다.
- [actor 교체 시 여러 effect cleanup과 응답 순서가 교차할 수 있다] → Account, environment, generation,
  request-version guard를 unit/interaction test에서 늦은 완료 순서로 검증한다.

## Migration Plan

1. 순수 상태 경계와 unit test를 추가한다.
2. 별도 Relay query와 open lifecycle controller를 연결하고 generated artifact를 갱신한다.
3. Profile option의 12-unit dot과 접근성 이름을 연결한다.
4. Storybook, Web E2E, app 정적 검증과 기존 API notification 회귀 검증을 실행한다.
5. Web keyboard/screen reader, Android TalkBack, iOS VoiceOver에서 option 이름·selected state·touch target을 확인한다.
6. 문제가 있으면 picker 전용 query·상태·presentation만 되돌린다. 기존 schema와 셸 badge는 변경하지 않으므로 별도
   데이터 migration이나 rollback은 필요 없다.

## Open Questions

없음.
