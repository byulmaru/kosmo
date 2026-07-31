## ADDED Requirements

### Requirement: Reaction 선택 component

클라이언트는 현재 허용된 여섯 Reaction Type을 기존 Post Action Bar의 anchored popover에서 선택하고 selected Profile의 Reaction 추가·삭제 상태를 조작하는 재사용 component를 제공해야 한다(MUST).

#### Scenario: 초기 선택지 표시

- **WHEN** Reaction 선택 component를 연다
- **THEN** component는 `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈`만 표시한다
- **AND** 현재 count가 0인 Type도 client catalog에서 같은 순서로 공급한다
- **AND** selected Profile이 이미 남긴 Type을 선택 상태로 표시한다

#### Scenario: Web Quick Picker geometry

- **WHEN** Reaction 선택 component를 Web에서 표시한다
- **THEN** 각 option은 32×32 CSS px target과 20px emoji를 사용한다
- **AND** pending spinner는 16×16px와 2px stroke를 사용한다
- **AND** option gap과 panel padding은 각각 4px이고 selected 배경 layer만 70% opacity를 사용한다
- **AND** 이번 Web 우선 변경은 현재 Native 44 logical unit option과 spinner geometry를 변경하지 않는다
- **AND** Android 48×48dp target과 iOS·Android runtime 검증은 Native 출시 전 gate로 유지한다

#### Scenario: anchored popover 열기와 닫기

- **WHEN** 사용자가 기존 Post Action Bar의 Reaction trigger를 누른다
- **THEN** Web·iOS·Android에서 trigger에 붙은 작은 floating popover를 연다
- **AND** 공간에 따라 trigger 위·아래로 전환하고 viewport와 safe area 안으로 수평 위치를 제한한다
- **AND** 여섯 option의 고유 너비가 가용 너비보다 크면 target 크기를 줄이지 않고 feature-local `ScrollView` shell 안에서 수평 scroll을 허용한다
- **AND** 같은 trigger 재입력, 외부 클릭·터치, Web `Escape` 또는 Android back으로 닫는다
- **AND** Web에서는 열릴 때 첫 option에 focus하고 닫힐 때 trigger에 focus를 복원한다

#### Scenario: 복수 Type 연속 조작

- **WHEN** 사용자가 열린 popover에서 한 Type의 추가 또는 삭제를 완료한다
- **THEN** popover는 열린 상태를 유지한다
- **AND** 사용자는 다른 Type을 이어서 조작할 수 있다

#### Scenario: selected Profile 부재

- **WHEN** guest이거나 현재 Account에 selected Profile이 없다
- **THEN** 기존 Post Action Bar의 Reaction trigger를 disabled 상태로 표시한다
- **AND** popover를 열거나 Reaction mutation을 시작하지 않는다
- **AND** 로그인·가입 또는 Profile 선택 onboarding 연결을 이 capability에 요구하지 않는다

#### Scenario: 선택하지 않은 Type 추가

- **WHEN** 사용자가 선택하지 않은 Reaction Type을 누른다
- **THEN** 클라이언트는 해당 Type의 멱등 추가 mutation을 실행한다
- **AND** mutation payload가 도착하기 전에는 선택 상태를 바꾸지 않는다
- **AND** payload의 Post가 제공한 `viewerReactions`와 `reactionCounts`를 Relay가 authoritative 상태로 정규화한다

#### Scenario: 선택한 Type 삭제

- **WHEN** 사용자가 이미 선택한 Reaction Type을 누른다
- **THEN** 클라이언트는 해당 Reaction의 멱등 삭제 mutation을 실행한다
- **AND** mutation payload가 도착하기 전에는 선택 상태를 바꾸지 않는다
- **AND** payload의 `post`가 있으면 nullable `reactionId`와 무관하게 반환된 `viewerReactions`와 `reactionCounts`를 authoritative 상태로 반영한다
- **AND** payload의 `post`가 `null`이면 client가 선택 상태나 count를 추측해 변경하지 않는다

#### Scenario: Type별 pending 입력

- **WHEN** 한 Reaction Type의 mutation이 pending이다
- **THEN** component는 같은 Type의 중복 입력을 막는다
- **AND** 다른 Type은 독립 mutation을 시작할 수 있고 기존 확정 상태를 잃지 않는다

#### Scenario: 부분 GraphQL 응답

- **WHEN** Reaction mutation의 필요한 payload와 GraphQL `errors`가 함께 반환된다
- **THEN** 클라이언트는 payload의 해당 Reaction 결과를 성공으로 처리한다
- **AND** payload가 없거나 network가 실패한 경우에만 기존 선택 상태를 유지하고 실패로 표시한다

#### Scenario: mutation 실패 복구

- **WHEN** Reaction 추가 또는 삭제 mutation이 실패한다
- **THEN** component는 서버가 확인한 이전 선택 상태를 유지한다
- **AND** 해당 Type에 inline `오류, 다시 시도` 상태를 제공하고 전역 toast를 요구하지 않는다

#### Scenario: mutation payload Post의 정규화

- **WHEN** add 또는 delete payload의 `post`가 non-null이다
- **THEN** Relay는 server가 반환한 Post의 `viewerReactions`와 `reactionCounts`를 정상 정규화한다
- **AND** 클라이언트는 수동 updater, local count delta 또는 targeted refetch를 사용하지 않는다

#### Scenario: selected Profile 전환과 늦은 응답

- **WHEN** mutation pending 중 selected Profile이 바뀌거나 대상 Post가 unmount된다
- **THEN** 열린 popover와 해당 화면의 pending·error 상태를 초기화한다
- **AND** 요청을 시작한 Relay Environment의 응답은 그 Environment 안에서만 cache를 갱신한다
- **AND** 이전 actor의 늦은 성공·실패 callback은 새 actor의 UI 상태를 변경하지 않는다

#### Scenario: 일반·Quote Post mutation 대상

- **WHEN** 일반 Post 또는 Quote Post의 Reaction action을 사용한다
- **THEN** 해당 Post ID를 mutation 대상으로 사용한다

#### Scenario: 순수 Repost mutation 대상

- **WHEN** 순수 Repost가 source Post의 Action Bar를 표시한다
- **THEN** source Post ID를 mutation 대상으로 사용한다

### Requirement: Post surface의 공유 Reaction controller

클라이언트는 한 Post surface의 Quick Picker와 Reaction 요약 token이 동일하게 결정된 `reactionTarget`, selected 상태, Type별 pending·error와 server-confirmed mutation 결과를 공유하게 해야 한다(MUST). 이를 위한 controller는 Reaction feature 내부에 유지해야 하며(MUST), generic context나 공용 mock infrastructure로 일반화해서는 안 된다(MUST NOT).

#### Scenario: Quick Picker와 요약 token의 공유 toggle

- **WHEN** 사용자가 Quick Picker option 또는 같은 Type의 Reaction 요약 token을 누른다
- **THEN** 두 control은 같은 selected Profile과 `reactionTarget`의 추가·삭제 동작을 실행한다
- **AND** 한쪽에서 성공한 선택 상태·pending·error 결과는 같은 surface의 다른쪽에도 일관되게 표시된다

#### Scenario: server-confirmed count 갱신

- **WHEN** Reaction 추가·삭제 mutation이 성공 payload를 반환한다
- **THEN** Relay는 payload Post의 `viewerReactions`와 `reactionCounts`를 authoritative 상태로 정규화한다
- **AND** mutation payload가 도착하기 전에는 선택 상태와 count를 바꾸지 않는다
- **AND** client는 local count delta나 targeted refetch를 사용하지 않는다

#### Scenario: mutation 실패와 actor 격리

- **WHEN** mutation이 실패하거나 actor 전환 뒤 이전 mutation callback이 도착한다
- **THEN** 실패 전 server-confirmed 선택 상태와 count를 유지한다
- **AND** 이전 actor callback은 새 actor의 선택·count·pending·error를 변경하지 않는다
- **AND** 실패한 Type 외의 toggle과 Profile 목록 탐색은 계속 사용할 수 있다

### Requirement: Reaction 요약 component

클라이언트는 목록과 상세 Post에 viewer-independent Type별 count를 현재 최초 Reaction 생성 시각 순으로 표시하고, 기존 token으로 같은 Type의 Reaction을 toggle하며, Reaction 전용 More 버튼에서 viewer가 조회할 수 있는 Profile 목록을 Type별 page 단위로 탐색할 수 있어야 한다(MUST).

#### Scenario: Type별 count 표시

- **WHEN** Post에 현재 Reaction이 존재한다
- **THEN** component는 server가 제공한 현재 최초 Reaction 생성 시각 순서로 Type과 count를 표시한다
- **AND** count 증감만으로 기존 Type 순서를 재정렬하지 않는다
- **AND** 새로 나타난 Type을 포함한 순서는 mutation 또는 query가 반환한 server 순서를 그대로 사용한다
- **AND** standalone `반응` 제목을 표시하지 않는다
- **AND** Web token은 높이 32px, radius 12px, emoji 20px, count 14px, 내부 gap 4px, 좌우 padding 8px와 token gap 4px을 사용한다
- **AND** selected token은 emoji·count와 분리한 `primary`/`primaryHover` 배경 layer만 70% opacity로 표시하고 emoji·count는 100% opacity를 유지한다

#### Scenario: Reaction이 없는 Post

- **WHEN** Post의 `reactionCounts`가 빈 목록이다
- **THEN** 클라이언트는 Reaction 요약 영역을 렌더링하지 않는다
- **AND** zero-count Type이나 별도 빈 요약 상태를 합성하지 않는다

#### Scenario: 기존 Reaction token toggle

- **WHEN** 사용자가 양수 count인 한 Reaction Type token을 누른다
- **THEN** selected Profile이 그 Type에 반응하지 않았다면 추가하고 이미 반응했다면 삭제한다
- **AND** token은 Profile 목록 modal을 직접 열지 않는다
- **AND** selected Profile이 없으면 token을 표시하되 disabled로 유지하고 mutation을 시작하지 않는다

#### Scenario: Reaction More와 Type tab Profile 목록 진입

- **WHEN** 사용자가 양수 count Type 뒤의 Reaction 전용 More 버튼을 누른다
- **THEN** 클라이언트는 현재 Post 위의 modal overlay를 연다
- **AND** modal 상단에 server가 제공한 양수 count Type을 같은 순서의 emoji tab으로 표시한다
- **AND** 처음 열 때 server 순서의 첫 Type을 선택하고 tab 전환 시 해당 Type의 Profile connection만 표시한다
- **AND** Profile 목록 제목은 선택 Type과 무관하게 `반응한 사람`으로 표시한다
- **AND** Profile 목록 item에는 현재 Type의 Reaction emoji를 표시한다
- **AND** tab의 고유 너비가 modal의 가용 너비보다 크면 tab을 축소하거나 wrap하지 않고 feature-local horizontal `ScrollView`에서 탐색하게 한다
- **AND** Profile row separator는 인접한 Profile 사이에만 표시하고 마지막 row 또는 단일 Profile 뒤에는 표시하지 않는다
- **AND** 별도 route나 공개 URL을 만들지 않는다
- **AND** server가 viewer 기준으로 숨긴 Profile을 client에서 복구하거나 count에서 빼지 않는다
- **AND** More는 selected Profile이 없어도 사용할 수 있다

#### Scenario: Reaction More geometry와 좁은 너비

- **WHEN** Reaction 요약 row를 Web에서 표시한다
- **THEN** 양수 count Type 뒤에 radius 12px의 32×32px target과 16px ellipsis의 More button을 표시한다
- **AND** 가용 너비가 부족하면 token과 More를 줄이거나 여러 줄로 바꾸지 않고 feature-local horizontal `ScrollView` shell을 사용한다

#### Scenario: 목록·상세와 Reaction 대상

- **WHEN** Reaction 요약 row를 목록 또는 상세 Post에 표시한다
- **THEN** 일반 Post와 Quote Post는 own Post를 `reactionTarget`으로 사용한다
- **AND** 순수 Repost는 source Post를 `reactionTarget`으로 사용한다
- **AND** 요약 row는 Post body 또는 source body 아래와 Post Action Bar 위에 표시한다

#### Scenario: Profile 목록 modal 닫기

- **WHEN** 사용자가 modal 외부 영역을 클릭·터치하거나 Android back을 실행한다
- **THEN** 클라이언트는 Profile 목록 modal을 닫는다
- **AND** modal 내부에는 별도 닫기 버튼을 표시하지 않는다

#### Scenario: Profile 목록 최초 조회 실패

- **WHEN** 선택한 Type의 Profile 목록 최초 조회가 실패한다
- **THEN** modal 내부에 오류와 다시 시도 동작을 표시한다
- **AND** snackbar·toast·전역 outlet을 조회 오류 복구에 요구하지 않는다

#### Scenario: Profile 목록 추가 page

- **WHEN** Type별 Profile 목록에 다음 page가 있다
- **THEN** component는 Relay cursor로 다음 page를 불러온다
- **AND** 이미 표시한 Profile을 중복 추가하지 않는다

#### Scenario: Profile 목록 추가 page 실패

- **WHEN** 다음 Profile page 조회가 실패한다
- **THEN** component는 이미 표시한 Profile을 유지한다
- **AND** 목록 내부에 오류와 다시 시도 동작을 표시한다
- **AND** snackbar·toast·전역 outlet을 조회 오류 복구에 요구하지 않는다

#### Scenario: Profile 목록 재진입과 actor 격리

- **WHEN** 같은 selected Profile이 이전에 조회한 Type의 modal을 다시 연다
- **THEN** 클라이언트는 cache된 Profile을 먼저 표시하고 background에서 최신 목록을 조회한다
- **AND** selected Profile 전환 뒤에는 이전 Relay Environment의 Profile 목록 cache를 표시하지 않는다

### Requirement: Reaction UI 검증 경계

Reaction 선택과 요약 UI는 각 소유 범위의 component 및 integration 경계에서 검증되어야 한다(MUST).

#### Scenario: component 상태 검증

- **WHEN** Reaction component와 integration test를 실행한다
- **THEN** Web 32px geometry, picker·token 공유 선택·해제, 복수 Type·pending·오류 복구·popover dismiss/focus, 목록·상세 Post 종류별 mutation 대상, actor 격리, mutation payload의 authoritative count, More·emoji tab·Profile item emoji와 pagination 상태를 실제 Relay data shape로 검증한다

#### Scenario: Post Action Bar 책임 경계

- **WHEN** 이 capability를 완료한다
- **THEN** PROD-417은 기존 Post Action Bar의 Reaction action과 실제 Post surface 연결을 제공한다
- **AND** Reply composer·Post Action Bar의 일반 More action을 포함한 전체 action 조립, 기존 `ActionMenu` 일반화와 범용 anchored overlay 추출은 요구하지 않는다
