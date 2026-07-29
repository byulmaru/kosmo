# Reaction UI

## 범위와 정보 구조

Reaction UI는 Post에 Reaction을 추가·삭제하는 Quick Picker와, 이미 등록된 Reaction의 Type별 count를 보여 주는 요약 row, Reaction을 남긴 Profile을 확인하는 목록 modal로 구성한다.

- 일반 Post와 Quote Post는 화면에 표시한 해당 Post를 Reaction 대상으로 사용한다.
- 순수 Repost는 바깥 Repost가 아니라 source Post를 Reaction 대상으로 사용한다.
- 목록과 상세 화면은 같은 대상 결정 규칙과 UI를 사용한다. Reaction 요약 row는 Post body 또는 source body 아래, Post Action Bar 위에 표시한다.
- Post surface는 `reactionTarget`을 한 번 결정하고 Quick Picker, 요약 row, Profile 목록에 같은 Post ID를 전달한다. 같은 surface 안에서 서로 다른 Post를 읽거나 변경하지 않는다.
- custom emoji Full Picker, API·DB 변경, 전역 toast, 범용 anchored popover, Reply composer, Post Action Bar의 일반 More action menu, 로그인·가입·Profile 선택 onboarding은 이 계약의 범위가 아니다.

## Reaction Quick Picker

Reaction Quick Picker는 현재 제공된 Reaction option을 빠르게 선택하는 펼쳐진 패널이다. option 목록과 toggle intent는 부모가 공급하며 Picker는 플랫폼별 시각 표현만 소유한다.

### 형태

- Web option은 Figma Post Action Bar의 28px 밀도와 함께 사용할 수 있도록 32×32 CSS px의 둥근 사각형으로 정규화하며 radius는 12px이다. emoji는 20px, option 사이 gap과 panel padding은 각각 4px이다. border를 포함한 panel의 전체 높이는 약 42px이다.
- iOS·Android의 target은 이번 Web 우선 변경에서 축소하지 않는다. iOS 44×44pt, Android 48×48dp 계약과 Native runtime 검증은 출시 gate로 유지한다.
- 바깥 컨테이너는 border가 있는 둥근 직사각형이며 radius는 16px이다.
- option 자체에는 border를 표시하지 않는다.
- 선택 여부는 border가 아니라 option 아래에 분리한 배경 layer로만 구분한다.
- 선택 배경은 기본 상태에서 `primary`, pressed 상태에서 `primaryHover`를 사용하고 각각 70% opacity로 표시한다. 이 opacity는 배경 layer에만 적용하며 emoji는 100% opacity를 유지한다.
- 오류 상태에도 빨간 border를 표시하지 않는다. 마지막 server-confirmed 선택 배경을 유지하고 접근성 문구와 재시도 동작으로 오류를 전달한다.

### Pending과 Disabled

- pending option의 emoji는 그대로 표시한다.
- 투명한 overlay가 option의 네 방향을 0으로 채워 option 전체를 덮는다.
- Web overlay 가운데에는 배경 track이 없는 16×16px spinner를 표시한다. spinner는 2px 두께의 연결된 180° 호이며, `textSecondary` 색의 짙은 head에서 완전히 투명한 tail까지 자연스럽게 흐려진다.
- Native spinner와 target geometry는 이번 Web 우선 변경에서 수정하지 않는다.
- spinner 호는 약 820ms마다 시계 방향으로 한 바퀴를 linear하게 회전한다. 점이나 분리된 spoke를 사용하지 않는다.
- overlay는 emoji 뒤에 렌더되는 sibling의 paint order를 사용하며 별도 `zIndex`를 두지 않는다.
- pending option만 입력을 막고 다른 Type은 계속 선택할 수 있다.
- Picker 전체가 disabled이면 비활성 UI를 표시하지 않고 Picker를 렌더링하지 않는다.

### 유지하는 계약

- 부모가 공급한 option 순서와 opaque ID를 그대로 사용한다.
- 서로 다른 Reaction Type은 동시에 선택될 수 있다.
- option은 button role, pressed·busy 상태와 상태별 접근성 label을 제공한다.
- trigger, popover 위치, Post Action Bar 배치, mutation·Relay/cache는 Picker의 시각 표현 범위가 아니다.

## Post Action Bar 통합

- 실제 Post Action Bar의 Reaction action은 현재 여섯 Type을 zero-count 여부와 무관하게 client catalog에서 공급하고, selected Profile의 `viewerReactions`를 선택 상태로 사용한다.
- Reaction trigger는 Web·iOS·Android 모두에서 trigger에 붙은 작은 floating popover를 열며 같은 trigger를 다시 누르면 닫힌다. 화면 공간에 따라 위·아래로 전환하고 viewport와 safe area 안으로 수평 위치를 제한한다. option row의 고유 너비가 가용 너비보다 크면 target 크기를 줄이지 않고 feature-local `ScrollView` shell 안에서 수평 scroll을 허용한다.
- popover는 외부 클릭·터치, Web `Escape`, Android back, 대상 Post unmount 또는 selected Profile 전환으로 닫힌다. Web에서는 열릴 때 첫 option으로 focus를 옮기고 닫힐 때 trigger로 focus를 복원한다.
- 한 Type을 선택하거나 해제한 뒤에도 popover를 유지해 여러 Type을 연속으로 조작할 수 있다.
- guest이거나 selected Profile이 없으면 Reaction trigger는 Action Bar 자리를 유지한 채 disabled로 표시하고 popover나 mutation을 시작하지 않는다.
- 이 통합은 기존 Post Action Bar의 Reaction 자리만 소유한다. 전체 action 조립과 범용 ActionMenu 일반화는 하지 않는다.

## Reaction 요약 row

- Post에 하나 이상의 Reaction이 있을 때만 요약 row를 표시한다. Reaction이 없으면 별도 빈 영역이나 zero-count Type을 표시하지 않는다.
- standalone `반응` 제목은 표시하지 않는다.
- server가 제공한 양수 count Type과 순서를 그대로 사용하며, 조회된 Profile 수로 count를 다시 계산하지 않는다.
- Web token은 높이 32px의 pill이다. emoji는 20px, count는 14px, 내부 gap은 4px, 좌우 padding은 8px, token 사이 gap은 4px이다.
- 요약 row의 token은 Profile 목록을 여는 control이 아니라 해당 Type의 Reaction을 추가·삭제하는 toggle이다. 선택 상태, pending, error와 disabled 상태는 Quick Picker와 동일한 controller에서 공급한다.
- 선택된 token은 Quick Picker와 동일하게 이모지·count와 분리한 `primary` 배경 layer를 70% opacity로 표시하고, pressed 상태에서는 `primaryHover`를 사용한다. 이모지와 count는 100% opacity를 유지한다.
- 이미 다른 사용자가 남겨 둔 token도 선택한 Profile의 Reaction이 없으면 추가하고, 있으면 삭제한다. mutation이 성공하기 전에는 count나 선택 상태를 바꾸지 않는다.
- selected Profile이 없으면 token은 보이지만 disabled이며 mutation을 시작하지 않는다.
- 양수 count Type 뒤에는 32×32px More button을 둔다. glyph는 16px ellipsis이며 Profile 목록 modal을 연다. More는 selected Profile이 없어도 사용할 수 있다.
- 가용 너비가 좁으면 token과 More를 줄이거나 여러 줄로 바꾸지 않고 feature-local horizontal `ScrollView` shell에서 같은 한 줄을 유지한다.

## Reaction Profile 목록

- More button은 현재 Post 위에 modal overlay를 열며 별도 route나 공개 URL은 만들지 않는다.
- modal 상단에는 server가 제공한 양수 count Type을 같은 순서로 emoji tab으로 표시한다. 처음 열 때 server 순서의 첫 Type을 선택하고, 사용자가 tab을 바꾸면 해당 Type의 Profile 목록을 표시한다.
- 각 tab은 emoji와 count, selected 상태를 표시한다. 목록 제목은 선택 Type과 무관하게 `반응한 사람`으로 표시하고, 각 item 왼쪽에는 Profile이 남긴 Reaction Type을 식별할 수 있는 emoji를 표시한다.
- modal은 외부 영역 클릭·터치와 Android back으로 닫으며 별도 닫기 버튼을 표시하지 않는다.
- Profile 목록의 최초 조회가 실패하면 modal 내부에 오류와 다시 시도 동작을 표시한다.
- 추가 page 조회가 실패하면 이미 표시한 Profile을 유지하고 목록 내부에 오류와 다시 시도 동작을 표시한다. 이 조회 오류에 snackbar나 toast를 사용하지 않는다.
- 같은 Type의 modal을 다시 열 때 cache된 Profile을 먼저 표시하고 background에서 최신 목록을 조회한다. Profile 전환 뒤에는 이전 actor의 cache를 재사용하지 않는다.
- token toggle의 mutation 오류와 Profile 조회 오류는 서로 독립적이다. 한쪽 오류가 다른쪽 interaction을 막지 않는다.

## Mutation과 공유 상태

- private `PostReactionController`가 한 `reactionTarget`의 `viewerReactions`, Type별 pending·error, mutation과 Relay cache 갱신을 소유한다. generic context나 공용 mock infrastructure로 일반화하지 않는다.
- Quick Picker option과 요약 token은 같은 controller 상태와 toggle 동작을 사용한다. 한쪽에서 성공한 변경은 같은 surface의 다른쪽에 즉시 같은 server-confirmed 상태로 보인다.
- 선택 상태와 count는 optimistic하게 바꾸지 않는다. mutation payload가 성공을 확인한 뒤에만 해당 Type의 상태를 반영한다.
- 성공 payload를 받은 뒤에는 그 결과로 확인할 수 있는 선택 상태와 count delta를 반영하고, 대상 Post의 `reactionCounts`만 좁게 다시 조회해 최종 server 상태로 맞춘다. API나 DB payload를 확장하지 않는다.
- 요청한 Type만 pending으로 막고 다른 Type은 계속 조작할 수 있다. 같은 Type의 연속 입력은 하나의 operation만 만들지만 서로 다른 Type은 동시에 진행할 수 있다.
- mutation 실패는 해당 Type에 기존 inline `오류, 다시 시도` 상태를 표시하며 전역 toast를 추가하지 않는다. 실패 전 선택 상태와 count를 유지하고 재시도는 해당 Type의 오류만 지운다.
- 필요한 mutation payload가 있으면 GraphQL `errors`가 함께 있어도 해당 Reaction 결과는 성공으로 처리한다. payload가 없거나 network가 실패하면 기존 선택 상태와 count를 유지한다.
- mutation, targeted refetch와 Relay cache 갱신은 요청을 시작한 selected Profile의 Relay Environment 안에서 끝낸다. 이전 actor의 늦은 성공·실패·refetch callback은 새 actor의 popover, pending, error, 선택 또는 count UI를 변경하지 않는다.
- 같은 actor의 여러 화면에서 동시에 보낸 요청을 client 전역에서 직렬화하지 않는다. 서로 다른 Type의 응답 순서는 보존되지만 같은 Type의 cross-surface 응답 순서는 server 결과에 따른다.

## 컴포넌트 경계

- `ReactionSelector`는 Quick Picker의 플랫폼별 presentation만 소유한다.
- private `ReactionAction`과 `ReactionPopover`는 Action Bar trigger와 anchored popover를 소유한다.
- private `PostReactionController`는 한 Post의 toggle 상태와 mutation/cache 동작을 소유한다.
- `ReactionSummary`는 token row와 More presentation을 소유한다.
- `PostReactionSummary`는 count·controller·Profile modal을 연결한다.
- `ReactionProfilesModal`은 emoji tab, Profile 목록, pagination과 조회 오류를 소유한다.
- `PostListItem`과 `PostLayout`은 일반·Quote·순수 Repost의 `reactionTarget`을 한 번 결정해 목록과 상세에 전달한다.
- `PostActionBar`에는 Reaction 전용 private controller 연결만 추가하며 generic slot이나 범용 menu abstraction을 만들지 않는다.

## 검증

- Storybook interaction에서 Web option의 exact 32×32px, 20px emoji, 16×16px spinner와 2px stroke, 70% selected 배경, 오류 재시도와 disabled 시 미렌더링을 검증한다.
- Reaction 요약은 exact 32px token·More geometry, standalone 제목 제거, Quick Picker와 공유하는 selected·pending·error 상태를 검증한다.
- mutation 성공 전 상태 불변, 성공 후 count delta와 targeted refetch, 실패 시 기존 상태 보존, Type별 동시성·재시도, selected Profile별 Environment 격리를 검증한다.
- 일반·Quote는 own Post ID, 순수 Repost는 source Post ID를 목록과 상세 각각에서 사용하는지 검증한다.
- selected Profile이 없을 때 Action Bar trigger와 token toggle은 disabled이고 popover·mutation이 없지만 More와 Profile 목록 조회는 가능한지 검증한다.
- modal의 양수 count emoji tab 순서, 기본 선택, tab별 목록, item emoji, pagination·최초/추가 조회 재시도와 actor별 cache 격리를 검증한다.
- 320px, 390px, 600px Web viewport에서 Quick Picker와 요약 row가 viewport 안에 머물고 exact 32px target을 유지한 채 feature-local horizontal scroll로 접근 가능한지 실제 관찰한다.
- 자동 검증과 Web runtime 관찰을 분리해 기록한다. iOS·Android runtime은 이번 Web 우선 범위의 완료 증거가 아니며 Native 출시 전 44pt·48dp target과 assistive technology 동작을 별도로 관찰한다.
