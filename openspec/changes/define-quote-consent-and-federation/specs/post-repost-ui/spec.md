## MODIFIED Requirements

### Requirement: selected Profile별 Repost child action

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/design/post-action-bar.md`, `PROD-389`, `PROD-414`, `PROD-431`, `PROD-432`, `PROD-433`, `PROD-471` 유니버설 앱은 공용 `PostActionBar`의 composite Post fragment가 private Repost action child fragment를 조립하게 해야 하며(MUST), child action은 viewer-independent count, selected Profile의 Active Repost 상태, 생성·취소 mutation과 interaction 상태를 같은 Relay 소유 경계에서 파생해야 한다(MUST). Repost trigger는 mutation을 즉시 실행하지 않고(MUST NOT) 항상 action menu를 열어야 한다(MUST).

#### Scenario: Repost하지 않은 상태

- **WHEN** 조회 Post의 `viewerRepost`가 `null`이다
- **THEN** action은 선택되지 않은 상태와 `repostCount`를 표시한다
- **AND** trigger를 활성화하면 `재게시하기` 항목을 가진 menu를 연다
- **AND** 사용자가 그 항목을 선택한 뒤 Source Post에 대한 Repost 생성 mutation을 호출한다

#### Scenario: 이미 Repost한 상태

- **WHEN** 조회 Post의 `viewerRepost`가 Active Repost Node다
- **THEN** action은 선택된 상태와 같은 viewer-independent `repostCount`를 표시한다
- **AND** trigger를 활성화하면 `재게시 취소` 항목을 가진 menu를 연다
- **AND** 사용자가 그 항목을 선택한 뒤 그 Repost Post ID에 대한 삭제 mutation을 호출한다

#### Scenario: 순수 Repost의 Action Bar target

- **WHEN** Content와 Reply Parent가 없고 direct Repost Source가 있는 순수 Repost 아래에 Action Bar를 표시한다
- **THEN** Repost child는 바깥 Repost가 아니라 화면에 표시한 direct Source fragment에서 `repostCount`와 `viewerRepost`를 읽는다
- **AND** menu 항목 선택 뒤 direct Source를 생성 target 또는 취소 상태의 기준으로 사용한다

#### Scenario: platform별 Repost action menu

- **WHEN** 사용자가 Web에서 Repost trigger를 활성화한다
- **THEN** 앱은 trigger 근처에 anchored menu를 열고 바깥 pointer·focus 또는 Escape로 닫으며 Escape 뒤 trigger로 focus를 돌려보낸다
- **AND** 방향키, Home과 End로 menu item focus를 이동할 수 있다
- **WHEN** 사용자가 Android 또는 iOS에서 Repost trigger를 활성화한다
- **THEN** 앱은 safe area를 고려한 bottom action sheet를 열고 backdrop·platform back action·dismiss gesture로 닫을 수 있게 한다
- **AND** 인용 조건에 맞는 Content Post에는 `인용하기`를 제공하고 선택 시 direct Source를 가진 공용 Composer를 연다

#### Scenario: pending 중 반복 입력

- **WHEN** Repost 생성 또는 취소 mutation이 진행 중이다
- **THEN** action은 pending·disabled 접근성 상태를 표시하고 반복 mutation 호출을 막는다
- **AND** 낙관 상태가 다른 selected Profile의 Relay Store로 전파되지 않는다

#### Scenario: Repost 생성 성공과 cache 동기화

- **WHEN** Repost 생성 mutation이 성공한다
- **THEN** 앱은 mutation payload의 Source Post ID, `repostCount`와 `viewerRepost` 결과로 normalized cache를 갱신한다
- **AND** 같은 actor Store에서 그 Post를 표시하는 목록과 상세의 action 상태가 일치한다

#### Scenario: PROD-414 Repost 취소 성공

- **WHEN** Repost 취소 mutation이 성공한다
- **THEN** 앱은 취소 요청을 완료하되 현재 `DeletePostPayload.postId`만으로 Source Post의 `repostCount`와 `viewerRepost` cache를 변경하지 않는다
- **AND** client count 산술, 광범위한 invalidation, 임시 refetch·local deselect 또는 같은 Tombstone ID를 숨기는 별도 client 상태를 추가하지 않는다

#### Scenario: PROD-471 Repost 취소 cache 동기화

- **WHEN** PROD-471의 서버 결과 기반 취소 계약이 완료된 뒤 Repost 취소 mutation이 성공한다
- **THEN** `DeletePostPayload.repostSource`는 nullable Source Post의 ID, 서버 확정 `repostCount`와 selected Profile별 `viewerRepost`를 반환한다
- **AND** 앱은 이 `repostSource` 결과로 normalized Source Post cache를 갱신한다
- **AND** 관련 없는 전체 refetch 없이 같은 actor Store의 중복 action 상태를 일치시키고 다른 actor Store에는 전파하지 않는다

#### Scenario: mutation 실패

- **WHEN** Repost 생성 또는 취소 mutation이 GraphQL 또는 network 오류로 실패한다
- **THEN** child action은 pending을 종료하고 이전 서버 확정 count·선택 상태와 normalized cache를 유지한다
- **AND** 생성 실패는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`, 취소 실패는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`라는 transient toast로 알린다
- **AND** toast는 safe area와 고정 탭 바 위의 화면 하단에서 약 3초 뒤 사라지고 새 toast가 기존 toast를 교체하며 alert semantics를 제공한다
- **AND** persistent error 상태, close·retry control 또는 성공 toast를 두지 않고 menu를 다시 열어 같은 action을 재시도할 수 있게 한다

#### Scenario: child action과 PostActionBar 경계

- **WHEN** Repost child action을 구현하고 검증한다
- **THEN** `PostActionBar_post`는 `RepostAction_post`를 child fragment로 spread하고 실제 fragment ref를 private `RepostAction`까지 전달한다
- **AND** private `RepostAction`은 `viewerRepost`에서 선택 상태, 접근성 label, 정확한 Active Repost delete identity와 create/delete mutation 종류를 함께 파생해 공통 private control을 렌더한다
- **AND** PROD-414의 `PostListItem`·`PostLayout` surface는 actual target Post fragment ref와 action별 Repost error callback을 공급하고 Action Bar를 content grid의 마지막 sibling이자 모든 navigation link 밖에 렌더링한다
- **AND** 최종 disabled 행동을 child에 연결할 concrete host input 또는 fragment shape, 나머지 action의 production 조립과 전체 통합 검증은 actual caller와 함께 PROD-432가 설계한다
- **AND** 독립 공개 action leaf 또는 선택 상태·label·delete identity·mutation callback의 독립 scalar config를 만들지 않는다

#### Scenario: Quote 진입과 순수 Repost 상태

- **WHEN** 사용자가 인용 가능한 action target의 `인용하기`를 선택한다
- **THEN** 메뉴를 닫고 해당 Post를 direct Source로 가진 기본 Quote 작성기를 연다
- **AND** 이 동작만으로 Post를 생성하거나 `repostCount`·`viewerRepost`를 변경하지 않는다
- **AND** Quote 허용 여부는 Source의 인용 정책·조회·차단 조건을 따르며 순수 Repost의 생성·취소 상태만으로 결정하지 않는다
- **AND** 원격 `interactionPolicy`에서 작성자가 automatic/manual 어느 쪽에도 포함되지 않으면 승인 가능성이 낮다는 힌트를 표시할 수 있으나 정책 자체를 승인 증거로 사용하지 않는다
