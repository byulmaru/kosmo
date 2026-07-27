## ADDED Requirements

### Requirement: Reaction 선택 component

클라이언트는 현재 허용된 여섯 Reaction Type을 기존 Post Action Bar의 anchored popover에서 선택하고 selected Profile의 Reaction 추가·삭제 상태를 조작하는 재사용 component를 제공해야 한다(MUST).

#### Scenario: 초기 선택지 표시

- **WHEN** Reaction 선택 component를 연다
- **THEN** component는 `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈`만 표시한다
- **AND** 현재 count가 0인 Type도 client catalog에서 같은 순서로 공급한다
- **AND** selected Profile이 이미 남긴 Type을 선택 상태로 표시한다

#### Scenario: anchored popover 열기와 닫기

- **WHEN** 사용자가 기존 Post Action Bar의 Reaction trigger를 누른다
- **THEN** Web·iOS·Android에서 trigger에 붙은 작은 floating popover를 연다
- **AND** 공간에 따라 trigger 위·아래로 전환하고 viewport와 safe area 안으로 수평 위치를 제한한다
- **AND** 같은 trigger 재입력, 외부 클릭·터치, Web `Escape` 또는 Android back으로 닫는다
- **AND** Web에서는 열릴 때 첫 option에 focus하고 닫힐 때 trigger에 focus를 복원한다

#### Scenario: 복수 Type 연속 조작

- **WHEN** 사용자가 열린 popover에서 한 Type의 추가 또는 삭제를 완료한다
- **THEN** popover는 열린 상태를 유지한다
- **AND** 사용자는 다른 Type을 이어서 조작할 수 있다

#### Scenario: 선택하지 않은 Type 추가

- **WHEN** 사용자가 선택하지 않은 Reaction Type을 누른다
- **THEN** 클라이언트는 해당 Type의 멱등 추가 mutation을 실행한다
- **AND** mutation payload가 도착하기 전에는 선택 상태를 바꾸지 않는다
- **AND** payload의 Reaction을 같은 Type 또는 같은 data ID의 기존 관계와 중복되지 않게 selected Profile의 Post Reaction cache에 반영한다

#### Scenario: 선택한 Type 삭제

- **WHEN** 사용자가 이미 선택한 Reaction Type을 누른다
- **THEN** 클라이언트는 해당 Reaction의 멱등 삭제 mutation을 실행한다
- **AND** mutation payload가 도착하기 전에는 선택 상태를 바꾸지 않는다
- **AND** payload의 `post`가 있으면 nullable `reactionId`와 무관하게 반환된 `viewerReactions`를 authoritative 상태로 반영한다
- **AND** payload의 `post`가 `null`이면 기존 cache에서 요청한 Type만 제거한다

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

#### Scenario: 없는 cache record를 합성하지 않음

- **WHEN** mutation payload가 있어도 대상 Post record 또는 기존 `viewerReactions` field가 cache에 없다
- **THEN** 클라이언트는 Post나 field를 합성하지 않는다

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

### Requirement: Reaction 요약 component

클라이언트는 Post의 viewer-independent Type별 count를 내림차순으로 표시하고, Type별로 viewer가 조회할 수 있는 Profile 목록을 열어 page 단위로 탐색할 수 있어야 한다(MUST).

#### Scenario: Type별 count 표시

- **WHEN** Post에 현재 Reaction이 존재한다
- **THEN** component는 Type과 count를 count 내림차순으로 표시한다
- **AND** count 동률 Type의 순서에 의존하지 않는다

#### Scenario: Reaction이 없는 Post

- **WHEN** Post의 `reactionCounts`가 빈 목록이다
- **THEN** 클라이언트는 Reaction 요약 영역을 렌더링하지 않는다
- **AND** zero-count Type이나 별도 빈 요약 상태를 합성하지 않는다

#### Scenario: Type별 Profile 목록 진입

- **WHEN** 사용자가 한 Reaction Type 요약을 연다
- **THEN** 클라이언트는 현재 Post 위의 modal overlay에서 그 Type의 Profile connection만 표시한다
- **AND** 별도 route나 공개 URL을 만들지 않는다
- **AND** server가 viewer 기준으로 숨긴 Profile을 client에서 복구하거나 count에서 빼지 않는다

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
- **THEN** 선택·해제·복수 Type·pending·오류 복구·popover dismiss/focus·Post 종류별 mutation 대상·actor 격리·count 정렬·Profile pagination 상태를 실제 Relay data shape로 검증한다

#### Scenario: Post Action Bar 책임 경계

- **WHEN** 이 capability를 완료한다
- **THEN** PROD-417은 기존 Post Action Bar의 Reaction action과 실제 Post surface 연결을 제공한다
- **AND** Reply composer·More를 포함한 전체 action 조립, 기존 `ActionMenu` 일반화와 범용 anchored overlay 추출은 요구하지 않는다
