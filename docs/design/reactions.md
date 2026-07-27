# Reaction UI

## Reaction Quick Picker

Reaction Quick Picker는 현재 제공된 Reaction option을 빠르게 선택하는 펼쳐진 패널이다. option 목록과 상태는 부모가 공급하며, Picker는 시각 표현과 toggle intent만 소유한다.

## 형태

- 바깥 컨테이너는 border가 있는 둥근 직사각형이며 radius는 16px이다.
- 각 option은 44×44px의 둥근 사각형이며 radius는 12px이다.
- option 자체에는 border를 표시하지 않는다.
- 선택 여부는 border가 아니라 option 아래에 분리한 배경 layer로만 구분한다.
- 선택 배경은 기본 상태에서 `primary`, pressed 상태에서 `primaryHover`를 사용하고 각각 70% opacity로 표시한다. 이 opacity는 배경 layer에만 적용하며 이모지는 100% opacity를 유지한다.
- 오류 상태에도 빨간 border를 표시하지 않는다. 마지막 선택 배경은 유지하고 접근성 문구와 재시도 동작으로 오류를 전달한다.

## Pending과 Disabled

- pending option의 이모지는 그대로 표시한다.
- 투명한 overlay가 option의 네 방향을 0으로 채워 44×44px 전체를 덮는다.
- overlay 가운데에는 배경 track이 없는 24×24px spinner를 표시한다. spinner는 3px 두께의 연결된 180° 호이며, `textSecondary` 색의 짙은 head에서 완전히 투명한 tail까지 자연스럽게 흐려진다.
- spinner 호는 약 820ms마다 시계 방향으로 한 바퀴를 linear하게 회전한다. 점이나 분리된 spoke를 사용하지 않는다.
- overlay는 이모지 뒤에 렌더되는 sibling의 paint order를 사용하며 별도 `zIndex`를 두지 않는다.
- pending option만 입력을 막고 다른 option은 계속 선택할 수 있다.
- Picker 전체가 disabled이면 비활성 UI를 표시하지 않고 Picker를 렌더링하지 않는다.

## 유지하는 계약

- 부모가 공급한 option 순서와 opaque ID를 그대로 사용한다.
- 서로 다른 Reaction Type은 동시에 선택될 수 있다.
- option은 button role, pressed·busy 상태와 상태별 접근성 label을 제공한다.
- trigger, popover 위치, Post Action Bar 배치, mutation·Relay/cache와 custom emoji Full Picker는 이 컴포넌트의 범위가 아니다.

## Post Action Bar 통합

- 실제 Post Action Bar의 Reaction action은 현재 여섯 Type을 zero-count 여부와 무관하게 client catalog에서 공급하고, selected Profile의 `viewerReactions`를 선택 상태로 사용한다.
- Reaction trigger는 Web·iOS·Android 모두에서 trigger에 붙은 작은 floating popover를 열며 같은 trigger를 다시 누르면 닫힌다. 화면 공간에 따라 위·아래로 전환하고 viewport와 safe area 안으로 수평 위치를 제한한다.
- popover는 외부 클릭·터치, Web `Escape`, Android back, 대상 Post unmount 또는 selected Profile 전환으로 닫힌다. Web에서는 열릴 때 첫 option으로 focus를 옮기고 닫힐 때 trigger로 focus를 복원한다.
- 한 Type을 선택하거나 해제한 뒤에도 popover를 유지해 여러 Type을 연속으로 조작할 수 있다.
- 일반 Post와 Quote Post의 action은 해당 Post를 대상으로 하고, 순수 Repost가 source Post의 Action Bar를 표시하는 경우에는 source Post를 대상으로 한다.
- guest이거나 selected Profile이 없으면 Reaction trigger는 Action Bar 자리를 유지한 채 disabled로 표시하고 popover나 mutation을 시작하지 않는다.
- 이 통합은 기존 Post Action Bar의 Reaction 자리만 소유한다. 전체 action 조립, Reply composer 연결, More 메뉴와 범용 anchored overlay 추출은 각각의 후속 범위로 유지한다.
- disabled trigger에서 로그인·가입 또는 Profile 선택 onboarding으로 연결하는 흐름은 후속 제품 계약으로 남긴다.

## Mutation과 상태

- 선택 상태는 optimistic하게 바꾸지 않고 server가 확인한 mutation payload가 도착한 뒤 갱신한다.
- 요청한 Type만 pending으로 막고 다른 Type은 계속 조작할 수 있다. 같은 Type의 연속 입력은 하나의 operation만 만들지만 서로 다른 Type은 동시에 진행할 수 있다.
- mutation 실패는 해당 Type에 기존 inline `오류, 다시 시도` 상태를 표시하며 전역 toast를 추가하지 않는다. 재시도는 해당 Type의 오류만 지운다.
- 필요한 mutation payload가 있으면 GraphQL `errors`가 함께 있어도 해당 Reaction 결과는 성공으로 처리한다. payload가 없거나 network가 실패하면 기존 선택 상태를 유지한다.
- mutation과 Relay cache 갱신은 요청을 시작한 selected Profile의 Relay Environment 안에서 끝낸다. 이전 actor의 늦은 성공·실패 callback은 새 actor의 popover, pending, error 또는 선택 UI를 변경하지 않는다.
- 같은 actor의 여러 화면에서 동시에 보낸 요청을 client 전역에서 직렬화하지 않는다. 서로 다른 Type의 응답 순서는 보존되지만 같은 Type의 cross-surface 응답 순서는 server 결과에 따른다.

## 검증

- Storybook interaction에서 border 없는 option, 70% opacity의 selected 배경과 100% opacity의 이모지, 44×44px pending overlay와 24×24px fading arc, 오류 재시도와 disabled 시 미렌더링을 검증한다.
- 390px와 600px Web viewport에서 여섯 option이 한 줄을 유지하고 각 target이 44×44px인지 확인한다.

## Reaction 요약과 Profile 목록

- Post에 하나 이상의 Reaction이 있을 때만 Type별 count 요약을 표시한다. Reaction이 없으면 별도 빈 요약 영역이나 zero-count Type을 표시하지 않는다.
- 요약은 server가 제공한 양수 count Type과 순서를 그대로 사용하며, viewer가 볼 수 있는 Profile 수로 count를 다시 계산하지 않는다.
- 사용자가 한 Type을 선택하면 현재 Post 위에 modal overlay를 열어 그 Type의 Profile 목록을 표시한다. 별도 route나 공개 URL은 만들지 않는다.
- modal은 외부 영역 클릭·터치와 Android back으로 닫으며 별도 닫기 버튼을 표시하지 않는다.
- Profile 목록의 최초 조회가 실패하면 modal 내부에 오류와 다시 시도 동작을 표시한다.
- 추가 page 조회가 실패하면 이미 표시한 Profile을 유지하고 목록 내부에 오류와 다시 시도 동작을 표시한다. 이 조회 오류에 snackbar나 toast를 사용하지 않는다.
- 같은 Type의 modal을 다시 열 때 cache된 Profile을 먼저 표시하고 background에서 최신 목록을 조회한다. Profile 전환 뒤에는 이전 actor의 cache를 재사용하지 않는다.
- Reaction 추가·삭제 mutation의 오류 알림 방식은 Reaction 요약·Profile 조회 UI의 계약에 포함하지 않는다.
