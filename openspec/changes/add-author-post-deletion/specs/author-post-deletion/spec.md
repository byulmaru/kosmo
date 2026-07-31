## ADDED Requirements

### Requirement: GraphQL 작성자 Post 삭제 경계

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-598` — GraphQL `deletePost(input: { id })` mutation은 `usingProfile` 인증으로 검증된 selected Profile을 Account 요청의 행동 주체로 사용해야 하며(MUST), 입력을 concrete Post global ID로 제한하고 decode된 Post ID와 행동 주체 Profile ID를 기존 Core Post 삭제 service에 전달해야 한다(MUST). 성공 payload는 Tombstone으로 전이된 Post의 concrete global `postId`를 반환해야 하며(MUST), Core/DB 삭제 계약이나 GraphQL schema shape를 다시 정의해서는 안 된다(MUST NOT).

#### Scenario: Author가 Active Post를 삭제한다

- **WHEN** Active Account의 selected Profile이 자신이 작성한 Active Post의 global ID로 `deletePost`를 호출한다
- **THEN** resolver는 selected Profile ID와 decode된 Post ID로 기존 Core 삭제 service를 한 번 호출한다
- **AND** 성공 payload는 삭제된 Post의 concrete global `postId`를 반환한다

#### Scenario: Author가 아닌 Profile이 삭제를 요청한다

- **WHEN** selected Profile이 다른 Author의 Post ID로 `deletePost`를 호출한다
- **THEN** 기존 Post 삭제 권한 계약에 따라 요청은 실패하고 대상 Post는 Active 상태를 유지한다

#### Scenario: 인증되지 않았거나 Post가 아닌 ID를 입력한다

- **WHEN** guest가 mutation을 호출하거나 입력 global ID의 concrete type이 Post가 아니다
- **THEN** resolver 경계는 Core 삭제를 실행하지 않고 요청을 거부한다

### Requirement: 작성자 전용 More 삭제 항목

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-598` — Action Bar는 16px `MoreHorizontal` 케밥 icon을 삭제를 즉시 실행하는 별도 button이 아니라 기존 `ActionMenu`를 여는 `더 보기` trigger로 제공해야 한다(MUST). More menu는 current selected Profile과 Action Bar target Post의 Author Profile이 같고 target이 Content를 가진 Active Post일 때만 `삭제` 항목을 표시해야 하며(MUST), guest·다른 Profile·Tombstone·Content 없는 Repost에는 표시해서는 안 된다(MUST NOT). `링크 복사`와 함께 제공할 때 `삭제`는 마지막에 배치하고 `Trash2` icon, theme `danger` 색과 접근성 이름 `게시글 삭제`를 사용해야 한다(MUST).

#### Scenario: 작성자가 contentful Post의 More menu를 연다

- **WHEN** selected Profile이 작성한 Active 일반 Post, Reply, Quote 또는 Reply이면서 Quote의 More trigger를 활성화한다
- **THEN** menu는 `삭제` 항목을 표시한다
- **AND** `링크 복사`도 있으면 `삭제`를 그 뒤 마지막 destructive item으로 표시한다

#### Scenario: 삭제 권한이 없는 viewer가 More menu를 연다

- **WHEN** guest 또는 target Post의 Author가 아닌 selected Profile이 More trigger를 활성화한다
- **THEN** menu는 `삭제` 항목을 표시하지 않는다

#### Scenario: 순수 Repost surface의 삭제 target

- **WHEN** Content와 Reply Parent가 없고 Repost Source만 있는 Post가 목록 또는 상세에 표시된다
- **THEN** More 삭제 eligibility와 mutation ID는 기존 Action Bar 배치 계약의 direct Repost Source를 기준으로 한다
- **AND** 바깥 Repost 취소는 Repost action menu가 계속 소유하며 More 삭제 항목으로 대체하지 않는다

### Requirement: 삭제 확인과 단일 실행

**Authority / Provenance:** `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `PROD-598` — 사용자가 `삭제` menu item을 선택하면 앱은 More menu를 닫고 title `게시글을 삭제할까요?`, 설명 `삭제한 게시글은 복구할 수 없습니다.`, action `취소`와 `삭제`를 가진 확인 dialog를 열어야 한다(MUST). menu item 선택만으로 mutation이나 cache 변경을 시작해서는 안 되며(MUST NOT), 사용자가 dialog의 `삭제`를 확인한 경우에만 target Post ID로 `deletePost`를 한 번 실행해야 한다(MUST). pending 중에는 중복 action과 dismiss 입력을 막고 destructive action에 busy 상태를 노출해야 한다(MUST).

#### Scenario: 사용자가 삭제를 취소한다

- **WHEN** 사용자가 확인 dialog에서 `취소`, Escape, platform back 또는 backdrop dismiss를 선택한다
- **THEN** 앱은 mutation과 cache 변경 없이 dialog를 닫고 More trigger로 focus를 돌려보낸다

#### Scenario: 사용자가 삭제를 확인한다

- **WHEN** 사용자가 확인 dialog의 `삭제`를 활성화한다
- **THEN** 앱은 Action Bar target Post의 global ID로 `deletePost`를 정확히 한 번 실행한다
- **AND** 요청이 끝날 때까지 확인 action의 중복 활성화와 dialog dismiss를 막는다

#### Scenario: 삭제 확인 전 입력

- **WHEN** 사용자가 More menu의 `삭제` 항목만 선택하고 확인 dialog의 `삭제`를 아직 활성화하지 않았다
- **THEN** 앱은 Post mutation이나 Relay cache 변경을 실행하지 않는다

### Requirement: 서버 확정 삭제와 Relay actor Store 동기화

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-598` — 앱은 GraphQL 성공 payload의 `postId`를 확인한 뒤에만 현재 Relay actor Store에서 해당 Post를 Active content로 제거해야 한다(MUST). Home·Profile Post List는 삭제된 Post edge를 계속 표시해서는 안 되고(MUST NOT), Post 상세는 기존 삭제됨·접근 불가 상태로 전환해야 하며(MUST), 다른 selected Profile의 Relay actor Store를 변경해서는 안 된다(MUST NOT). 성공하면 menu와 확인 dialog를 닫고 성공 toast는 표시하지 않아야 한다(MUST NOT).

#### Scenario: 목록에서 삭제가 성공한다

- **WHEN** Home 또는 Profile Post List에서 `deletePost`가 성공하고 payload가 target `postId`를 반환한다
- **THEN** 현재 actor Store의 관련 목록은 삭제된 Post를 Active edge로 계속 표시하지 않는다
- **AND** 다른 actor Store의 같은 Post record와 connection은 변경되지 않는다

#### Scenario: 상세에서 삭제가 성공한다

- **WHEN** Post 상세에서 `deletePost`가 성공한다
- **THEN** 상세 surface는 기존 삭제됨·접근 불가 상태로 전환하고 확인 UI를 닫는다
- **AND** 성공 toast는 표시하지 않는다

#### Scenario: 서버 성공 전 cache 상태

- **WHEN** 삭제 mutation이 아직 pending이거나 서버가 실패 응답을 반환한다
- **THEN** 앱은 target Post나 관련 connection에 optimistic 삭제를 적용하지 않는다

### Requirement: 실패 복구와 접근 가능한 오류 안내

**Authority / Provenance:** `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `PROD-598` — 삭제 mutation이 실패하면 앱은 서버 확정 Post와 Relay cache를 유지하고 확인 dialog를 열린 상태에서 재시도 가능한 상태로 복구해야 한다(MUST). 공용 toast host는 `게시글을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.`를 alert semantics로 표시해야 하며(MUST), 다음 `삭제` 입력은 같은 target Post로 새 mutation을 실행할 수 있어야 한다(MUST).

#### Scenario: 삭제 mutation이 실패한다

- **WHEN** `deletePost`가 GraphQL 또는 network 오류로 실패한다
- **THEN** target Post와 목록 connection은 mutation 전 서버 확정 상태를 유지한다
- **AND** 확인 dialog는 destructive action과 dismiss를 다시 활성화해 재시도 또는 취소할 수 있게 한다
- **AND** 공용 toast host는 한국어 실패 문구를 새 alert instance로 표시한다

#### Scenario: 실패 뒤 재시도한다

- **WHEN** 실패 안내 뒤 사용자가 같은 확인 dialog에서 `삭제`를 다시 활성화한다
- **THEN** 앱은 같은 target Post ID로 새 `deletePost` 요청을 한 번 실행한다

### Requirement: Web·Android·iOS 삭제 흐름 접근성

**Authority / Provenance:** `docs/design/post-action-bar.md`, `docs/design/accessibility.md`, `PROD-598` — More trigger는 button role, `더 보기` accessible name과 menu expanded 상태를 제공해야 하며(MUST), Web은 기존 anchored menu의 keyboard·focus·dismiss 계약을, Android·iOS는 기존 safe-area bottom action sheet와 modal/menu 계약을 재사용해야 한다(MUST). 삭제 확인은 Web에서 `alertdialog`, Android·iOS에서 modal 접근성 의미를 제공하고 처음 열릴 때 안전한 `취소` action에 focus를 두어야 하며(MUST), pending 전 취소로 닫으면 More trigger에 focus를 복구해야 한다(MUST).

#### Scenario: Web keyboard 삭제 흐름

- **WHEN** Web 사용자가 keyboard로 More menu의 `삭제`를 선택한다
- **THEN** anchored menu가 닫히고 `alertdialog`가 열리며 `취소` action이 초기 focus를 받는다
- **AND** pending 전 Escape로 닫으면 More trigger가 focus를 돌려받는다

#### Scenario: Native 삭제 흐름

- **WHEN** Android 또는 iOS 사용자가 bottom action sheet의 `삭제`를 선택한다
- **THEN** sheet가 닫히고 modal 의미를 가진 확인 UI가 열린다
- **AND** pending 전 platform back이나 backdrop dismiss는 mutation 없이 확인 UI를 닫는다

#### Scenario: pending 접근성 상태

- **WHEN** 삭제 mutation이 pending이다
- **THEN** destructive confirmation action은 busy·disabled 상태를 보조 기술에 노출하고 중복 입력을 받지 않는다

### Requirement: 삭제 흐름의 surface 일관성과 회귀 방지

**Authority / Provenance:** `docs/design/post-action-bar.md`, `PROD-598` — Home Post List, Profile Post List와 Post 상세는 같은 author deletion 계약을 사용해야 하며(MUST), 삭제 action을 navigation `Link`나 Post detail `Pressable` 안에 중첩해서는 안 된다(MUST NOT). 새 More 삭제 흐름은 Repost 생성·취소, Reaction, Reply, Bookmark와 기존 More `링크 복사` action의 target·pending·cache 의미를 변경해서는 안 된다(MUST NOT).

#### Scenario: 목록과 상세에서 같은 계약을 사용한다

- **WHEN** 같은 Author Post가 Home·Profile 목록과 상세에 표시된다
- **THEN** 각 surface는 같은 More 삭제 eligibility, 확인, mutation identity와 실패 복구 계약을 사용한다

#### Scenario: 다른 Post action이 함께 표시된다

- **WHEN** 삭제 가능한 Post의 Action Bar에 Repost·Reaction·Reply·Bookmark 또는 `링크 복사`도 표시된다
- **THEN** 삭제 menu의 open·pending·성공·실패 상태는 다른 action의 입력과 상태를 불필요하게 차단하거나 변경하지 않는다
