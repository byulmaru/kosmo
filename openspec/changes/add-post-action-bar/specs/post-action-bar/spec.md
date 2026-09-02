## ADDED Requirements

### Requirement: 고정된 액션 구성

**Authority / Provenance:** `PROD-432`, `PROD-433`, `PROD-414`, `PROD-866` — Post Action Bar는 표시하도록 제공된 액션을 Reply → Repost → Reaction → Bookmark → More 순서의 단일 행으로 렌더해야 한다(MUST). 액션별 config 또는 구현된 child action fragment가 제공되지 않으면 해당 위치를 렌더하지 않아야 하며(MUST), 남은 액션의 상대 순서는 바꾸지 않아야 한다(MUST). 지원되는 production Post surface는 composite Post fragment와 나머지 action config로 다섯 액션을 모두 제공해야 하며(MUST), Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 권한 때문에 실행할 수 없는 액션도 생략하지 않고 disabled 상태로 제공해야 한다(MUST). Web의 Bookmark와 More는 50px Bookmark, 4px 간격, 28px More로 이루어진 82px trailing group이어야 한다(MUST). More는 icon-only 액션이어야 하며(MUST) count나 의미적 선택·처리 상태를 자체적으로 제공하지 않아야 한다(MUST).

#### Scenario: 모든 액션 표시

- **WHEN** 다섯 액션의 config 또는 child fragment가 모두 제공된다
- **THEN** Action Bar는 Reply, Repost, Reaction, Bookmark, More 순서로 렌더한다
- **AND** Web의 Bookmark와 More는 4px 간격을 둔 82px trailing group으로 오른쪽 끝에 배치된다

#### Scenario: 독립 컴포넌트의 선택적 액션 생략

- **WHEN** production Post surface가 아닌 독립 컴포넌트 사용에서 일부 액션의 config 또는 child fragment가 제공되지 않는다
- **THEN** Action Bar는 해당 액션을 숨기고 제공된 액션의 상대 순서를 유지한다

#### Scenario: 독립 컴포넌트의 More 표시

- **WHEN** More 설정과 callback이 제공된다
- **THEN** Action Bar는 접근 가능한 icon-only More 버튼을 표시하고 메뉴나 링크 복사 동작은 실행하지 않는다

#### Scenario: Production More 표시

- **WHEN** production Post fragment가 제공되고 독립 컴포넌트용 More callback은 제공되지 않는다
- **THEN** Action Bar는 private `PostDeletionAction` child가 소유하는 접근 가능한 icon-only More 버튼을 표시한다
- **AND** surface가 제공한 menu item과 child가 파생한 삭제 자격을 하나의 menu에 조합한다

### Requirement: 액션의 시각 상태

**Authority / Provenance:** `PROD-433`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425`, `PROD-598`, `PROD-866`, `PROD-882` — Reply·Reaction·Bookmark는 default·pending·disabled 처리 상태와 각각 controlled `expanded`, `hasReacted`, `hasBookmarked`를 받아야 하며(MUST), private Repost child action은 `viewerRepost`와 mutation 진행 상태에서 `hasReposted` 및 default·pending을 함께 파생해야 한다(MUST). Repost의 최종 disabled 행동은 유지하되 concrete policy input 또는 fragment shape를 PROD-414가 선결해서는 안 되며(MUST NOT), actual production caller와 함께 PROD-432가 설계해야 한다(MUST). 범용 `selected`를 공개 prop으로 제공하지 않아야 하며(MUST NOT), Reaction과 Bookmark는 count를 받지 않아야 한다(MUST NOT). Reply·Reaction·Bookmark의 default 상태는 보조 텍스트 색상의 outline icon과 Reply가 제공한 선택적 count를 표시해야 한다(MUST). 미선택 Repost의 glyph와 count는 보조 텍스트 색상을 사용해야 하며(MUST), Web hover에서는 glyph와 background만 semantic `actionRepostBase`를 사용하고 count는 보조 텍스트 색상을 유지해야 한다(MUST). selected Repost의 glyph와 count는 Light에서 `#16794A`, Dark에서 `#409667`인 `actionRepostBase`를 사용해야 하며(MUST), Reaction은 `HeartPlus` glyph를 사용하고 active·hover에서 semantic `actionReactionBase` (`#F97066`)를 사용해야 한다(MUST). Web hover·pressed에서 Reply count는 glyph와 같은 foreground를 사용해야 하며(MUST), Repost count에는 앞의 미선택·selected 규칙이 우선해야 한다(MUST). pressed는 각 상태의 foreground와 72% opacity를 함께 유지해야 한다(MUST). `hasReacted` 또는 `hasBookmarked`가 true이면 pending spinner를 표시하는 동안을 제외하고 HeartPlus 또는 Bookmark icon 내부를 현재 처리 상태 색상으로 채워야 한다(MUST). 처리 상태의 시각 표현은 도메인 상태의 action semantic 또는 primary 표현보다 우선해야 한다(MUST). pending 상태는 icon 자리에 spinner를 표시하고(MUST), disabled 상태는 icon과 제공된 count를 비활성 표현으로 약화해야 한다(MUST). pending·disabled 중에도 `expanded`·`hasReposted`·`hasReacted`·`hasBookmarked`의 의미와 접근성 상태를 잃지 않아야 한다(MUST). 독립 UI용 More config는 callback과 accessibility label을 받아야 하고(MUST) count·도메인 상태·pending·disabled 입력을 받지 않아야 하며(MUST), production private `PostDeletionAction`은 자기 mutation pending과 menu expanded 상태를 내부에서 관리해야 한다(MUST).

#### Scenario: 활성인 도메인 상태

- **WHEN** Repost의 `hasReposted`, Reaction의 `hasReacted` 또는 Bookmark의 `hasBookmarked`가 true이고 처리 상태가 default다
- **THEN** Action Bar는 Repost icon과 count를 현재 mode의 `actionRepostBase`로 표시하고, Reaction HeartPlus는 `actionReactionBase`, Bookmark icon은 primary 색상으로 내부를 채우며 도메인 의미를 접근성 상태로 노출한다

#### Scenario: 미선택 Repost와 Reaction

- **WHEN** Repost와 Reaction이 default 처리 상태이며 선택되지 않았다
- **THEN** Repost glyph와 count는 보조 텍스트 색상으로 표시된다
- **AND** Web hover에서는 Repost glyph와 원형 background만 현재 mode의 `actionRepostBase`로 바뀌고 count는 보조 텍스트 색상을 유지한다
- **AND** Reaction HeartPlus는 보조 텍스트 색상으로 표시되고 Web hover에서 `actionReactionBase`를 사용한다

#### Scenario: 활성인 도메인 상태의 처리 중 상태

- **WHEN** 활성인 도메인 상태를 가진 액션의 처리 상태가 pending으로 바뀐다
- **THEN** Action Bar는 icon 자리에 spinner를 표시하면서 해당 도메인 의미의 접근성 상태를 유지한다

#### Scenario: 활성인 도메인 상태의 비활성 상태

- **WHEN** 활성인 도메인 상태를 가진 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 primary 대신 비활성 표현을 사용하고 입력을 차단하면서 도메인 의미와 disabled 접근성 상태를 함께 유지한다

#### Scenario: Reply Composer의 controlled 상태

- **WHEN** 외부 Reply Composer가 열리거나 닫히며 `expanded`가 변경된다
- **THEN** Action Bar는 값을 자체 전환하지 않고 전달받은 `expanded`를 Reply의 시각·접근성 상태에 반영한다

#### Scenario: 비활성 상태

- **WHEN** 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 icon과 count를 비활성 표현으로 표시한다

### Requirement: 액션 입력 계약

**Authority / Provenance:** `docs/design/post-action-bar.md`, `PROD-432`, `PROD-433`, `PROD-414`, `PROD-598` — Post Action Bar toolbar는 composite Post fragment와 고정 action 순서를 소유해야 하며(MUST), 구현된 private child action은 자신의 child fragment, mutation, pending과 파생 도메인 상태를 소유하고 공통 private control을 렌더할 수 있어야 한다(MUST). Reply·Reaction·Bookmark callback, controlled Composer, navigation과 production 링크 item은 외부 surface가 소유해야 하며(MUST), PROD-414 surface는 Repost child에 actual target Post fragment ref와 action별 error callback을 제공해야 한다(MUST). Repost child는 자기 action menu의 open·dismiss·선택 결과를 조립할 수 있어야 하고(MUST), production `PostDeletionAction` child는 surface의 menu item과 자기 삭제 item을 조합해 More menu·확인 dialog·delete mutation 상태를 소유해야 한다(MUST). toolbar container는 child mutation payload 또는 cache update 정책을 재구현하지 않아야 한다(MUST NOT). Repost trigger는 사용자 입력 시 mutation을 즉시 실행하지 않고(MUST NOT) action menu를 열어야 하며(MUST), menu 항목 선택 뒤 fragment 상태에서 파생한 mutation을 한 번 실행해야 한다(MUST). Reply·Reaction·Bookmark의 default 상태는 사용자 입력 시 해당 callback을 한 번 실행해야 하며(MUST), pending·disabled 상태는 touch, pointer 및 keyboard 입력을 차단해야 한다(MUST). 대상 적격성·현재 실행 주체 권한·guest 인증 위임에서 파생할 최종 disabled 행동은 actual production caller와 함께 PROD-432가 설계해야 한다(MUST). 독립 UI용 More config는 사용자 입력 시 상태 전이 없이 callback을 한 번 호출해야 하며(MUST), production More는 private child menu를 열어야 한다(MUST).

#### Scenario: 기본 액션 실행

- **WHEN** 사용자가 default 상태이거나 도메인 상태가 활성인 액션을 활성화한다
- **THEN** config 기반 액션은 해당 callback을 한 번 호출한다
- **AND** Repost child는 action menu를 열고 아직 mutation을 호출하지 않는다

#### Scenario: 처리 중 중복 입력 차단

- **WHEN** 사용자가 pending 상태의 액션을 다시 활성화한다
- **THEN** Action Bar는 입력을 차단하고 callback 또는 child mutation을 호출하지 않는다

#### Scenario: 비활성 입력 차단

- **WHEN** 사용자가 disabled 상태의 액션을 활성화하려 한다
- **THEN** Action Bar는 callback 또는 child mutation을 호출하지 않는다

#### Scenario: 독립 컴포넌트의 More callback 실행

- **WHEN** 사용자가 More를 활성화한다
- **THEN** Action Bar는 More callback을 한 번 호출하고 메뉴나 clipboard 동작을 자체 수행하지 않는다

#### Scenario: Production More child 실행

- **WHEN** 사용자가 production More를 활성화한다
- **THEN** private `PostDeletionAction`은 surface가 공급한 item과 삭제 자격을 조합한 menu를 연다
- **AND** toolbar container는 clipboard나 delete mutation을 직접 실행하지 않는다

### Requirement: Repost action menu

**Authority / Provenance:** `docs/design/post-action-bar.md`, `PROD-414`, `PROD-431` — Repost action은 선택 여부와 관계없이 동일 trigger에서 action menu를 열어야 하고(MUST), 현재 selected Profile의 `viewerRepost` 상태에 따라 정확히 `재게시하기` 또는 `재게시 취소` 항목을 제공해야 한다(MUST). Web은 trigger 근처 anchored menu를 사용해야 하고(MUST), Android·iOS는 safe area를 고려한 bottom action sheet를 사용해야 한다(MUST). menu는 platform별 dismiss·focus·back·keyboard·modal 접근성 계약을 만족해야 하며(MUST), 항목 선택으로 menu를 닫은 뒤 해당 mutation을 시작해야 한다(MUST). PROD-431이 완료되기 전에는 `인용하기`를 disabled나 placeholder 항목으로도 표시하지 않아야 한다(MUST NOT).

#### Scenario: 미선택 Repost menu

- **WHEN** `viewerRepost`가 `null`인 Repost trigger를 활성화한다
- **THEN** menu는 `재게시하기` 항목 하나를 표시한다
- **AND** 항목을 선택하면 Source Post를 대상으로 `repostPost`를 한 번 호출한다

#### Scenario: 선택된 Repost menu

- **WHEN** `viewerRepost`가 Active Repost identity인 Repost trigger를 활성화한다
- **THEN** menu는 `재게시 취소` 항목 하나를 표시한다
- **AND** 항목을 선택하면 해당 Active Repost ID를 대상으로 `deletePost`를 한 번 호출한다

#### Scenario: Web anchored menu

- **WHEN** Web에서 Repost menu가 열린다
- **THEN** menu는 scroll container 밖의 overlay layer에서 trigger 근처에 배치되고 trigger는 popup·expanded 상태를 노출한다
- **AND** 첫 action item target은 trigger의 pointer 지점을 덮어 포인터를 움직이지 않은 두 번째 활성화가 실제 menu item을 선택한다
- **AND** menu는 첫 item에서 아래 방향으로 펼치되 viewport 가장자리 안으로 보정되어 화면이나 scroll container에 잘리지 않는다
- **AND** item은 theme card surface, 36px 높이, 128px 최소폭, 8px 좌우 padding, 18px Repost icon, 14px·500 label, 1px menu border와 `0 2px 4px` shadow를 사용한다
- **AND** 바깥 pointer·focus 또는 Escape로 닫히며 Escape 뒤 trigger로 focus가 돌아간다
- **AND** 방향키, Home과 End로 item focus를 이동할 수 있다

#### Scenario: Native bottom action sheet

- **WHEN** Android 또는 iOS에서 Repost menu가 열린다
- **THEN** sheet는 safe area를 고려해 화면 아래에 표시되고 backdrop·platform back action·dismiss gesture로 닫을 수 있다
- **AND** modal·menu 의미와 최소 44×44 item target을 제공한다

#### Scenario: 미래 Quote action 미노출

- **WHEN** PROD-431의 Quote 작성 계약이 아직 완료되지 않았다
- **THEN** Repost menu는 `인용하기`를 표시하지 않는다

### Requirement: 액션 접근성

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/post-action-bar.md`, `PROD-433`, `PROD-414`, `PROD-432`, `PROD-866` — Action Bar 컨테이너는 toolbar role과 고정된 한국어 접근성 이름 `액션 바`를 노출해야 하며(MUST), 내부 액션을 하나의 접근성 요소로 병합하지 않아야 한다(MUST NOT). 표시되는 각 액션은 button role과 액션별 label을 노출해야 하며(MUST) 시각 icon이나 count에만 의미를 의존하지 않아야 한다(MUST). Action Bar와 각 control의 visual/layout row 높이는 Android·iOS·Web에서 28 logical unit이어야 한다(MUST). Reply·Repost·Reaction·Bookmark layout slot은 최소 너비 50이고 More slot 너비는 28이어야 하며(MUST), Bar는 별도 좌우 inset 없이 Reply slot의 왼쪽 경계와 More slot의 오른쪽 경계를 PostBody content column의 양끝에 맞추고 나머지 action을 그 사이에 분배해야 한다(MUST). Web의 Bookmark와 More는 4px 간격을 둔 82px trailing group이어야 한다(MUST). 각 glyph visual box는 16×16이고 icon과 count 간격은 4여야 한다(MUST). 실제 Web target은 slot 가운데에 있어야 하며(MUST), count가 있으면 숫자 `0`을 포함해 `왼쪽 6px + glyph 16px + gap 4px + 렌더된 count + 오른쪽 6px`을 HUG하고 count가 없으면 28×36px이어야 한다(MUST). social target이 50px보다 넓을 때만 해당 slot도 target 너비로 확장해야 하며(MUST), glyph 왼쪽 경계는 target 왼쪽보다 6px 안쪽이어야 한다(MUST). hover·pressed의 visible state layer는 count를 감싸지 않고 glyph 주위 28×28px 원을 유지해야 하며(MUST), 모든 target은 action 사이 분배 여백이나 인접 target을 덮지 않아야 한다(MUST). Native의 공용 projection은 출시 전 임시 예외이며 iOS 출시 전 최소 44×44pt, Android 출시 전 최소 48×48dp로 복구하고 runtime 검증해야 한다(MUST). Reply의 `expanded`, Repost child가 `viewerRepost`에서 파생한 `hasReposted`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`와 각 액션의 pending·disabled 상태는 플랫폼에서 지원하는 접근성 state로 노출해야 한다(MUST). Repost policy-disabled 접근성 state는 concrete seam과 actual caller를 설계하는 PROD-432 surface 통합에서 검증해야 한다(MUST). 이 접근성 매핑 내부에서는 플랫폼의 `selected`·`pressed`·`expanded` 용어를 사용할 수 있지만 공개 제품 prop 이름을 바꾸지 않아야 한다(MUST). More는 button role과 label을 제공하되 도메인 상태 또는 처리 상태를 노출하지 않아야 한다(MUST).

#### Scenario: 이름이 있는 툴바 탐색

- **WHEN** 한 화면에 하나 이상의 Action Bar가 렌더된다
- **THEN** 보조 기술은 각 컨테이너를 `액션 바`라는 이름의 toolbar로 식별하고 그 안의 액션 button을 개별적으로 탐색할 수 있다

#### Scenario: 보조 기술로 액션 탐색

- **WHEN** 보조 기술 사용자가 Action Bar를 탐색한다
- **THEN** 각 표시 액션은 고유한 label을 가진 button으로 노출된다

#### Scenario: 도메인 상태와 처리 상태 전달

- **WHEN** 액션의 도메인 상태가 활성이고 처리 상태가 pending이다
- **THEN** 보조 기술은 해당 도메인 의미와 busy 상태를 함께 인식할 수 있다

#### Scenario: 비활성 상태 전달

- **WHEN** 액션이 disabled다
- **THEN** 보조 기술은 액션이 비활성임을 인식할 수 있다

#### Scenario: Figma 기반 compact geometry

- **WHEN** Action Bar가 지원하는 compact 폭에 렌더된다
- **THEN** Bar와 각 control의 visual/layout row는 높이 28, social layout slot 최소 너비 50, More slot 너비 28, glyph 16×16, icon-count 간격 4를 유지한다
- **AND** Reply slot의 왼쪽 경계와 More slot의 오른쪽 경계는 PostBody content column의 양끝에 맞고 나머지 action은 그 사이에 균등 분배된다
- **AND** Web의 Bookmark와 More는 4px 간격을 둔 82px trailing group이다
- **AND** Web actual target은 slot 가운데에 있고 count가 있으면 숫자 `0`을 포함해 `6 + 16 + 4 + 렌더된 count 너비 + 6`을 HUG하며 count가 없으면 28×36px이다
- **AND** social slot은 `max(50, target 너비)`이고 glyph는 target 왼쪽보다 6px 안쪽에 있으며, 28×28 state layer는 glyph만 감싸고 action 사이 분배 여백이나 인접 target을 덮지 않는다

#### Scenario: Native 출시 전 임시 target

- **WHEN** 같은 Action Bar 구현이 Android 또는 iOS에서 렌더된다
- **THEN** 현재 Web 우선 slice에서는 28dp·28pt geometry를 사용한다
- **AND** 이를 Native 접근성 완료 증거로 사용하지 않으며 각 Native 출시 전에 플랫폼 target과 runtime gate를 복구한다

### Requirement: Compact count 표시

**Authority / Provenance:** `PROD-432`, `PROD-433`, `PROD-414` — Action Bar는 Reply config와 Repost child fragment에 선행 계약이 제공한 0 이상의 정수 count만 표시해야 하며(MUST), 실행 환경 locale을 사용하는 표준 compact number formatting 결과를 사용해야 한다(MUST). Action Bar는 K/M 단위, 반올림 경계, 단위 승격 또는 표시 상한을 자체 알고리즘으로 재구현하지 않아야 하며(MUST NOT), locale에 따른 단위와 반올림 결과를 이 OpenSpec에서 별도로 고정하지 않아야 한다(MUST NOT). Reaction·Bookmark·More는 count 입력을 받거나 표시하지 않아야 하며(MUST NOT), count 계약이 없거나 값이 제공되지 않은 Reply·Repost에 `0` 또는 placeholder를 합성하지 않아야 한다(MUST NOT).

#### Scenario: 실행 환경 locale의 compact 표시

- **WHEN** Reply 또는 Repost에 count가 제공되고 실행 환경 locale이 한국어 또는 영어다
- **THEN** Action Bar는 해당 locale의 표준 compact number formatting 결과를 표시한다

#### Scenario: Reaction과 Bookmark count 제외

- **WHEN** Reaction 또는 Bookmark 설정이 제공된다
- **THEN** Action Bar는 해당 액션의 count를 입력받거나 렌더하지 않는다

#### Scenario: count 계약이 없는 액션

- **WHEN** 선행 action 계약이 count를 제공하지 않거나 optional count 값이 없다
- **THEN** Action Bar는 `0`이나 placeholder를 합성하지 않고 icon만 표시한다

### Requirement: 반응형 배치

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-433`, `PROD-434` — Action Bar는 mobile·compact·full의 지원 폭에서 액션을 한 행에 배치해야 하고(MUST) 줄바꿈이나 순서 변경 없이 사용 가능한 가로 공간에 분배해야 한다(MUST). 이 change의 필수 폭 검증은 기존 Storybook viewport인 `kosmoMobile` 390px, `kosmoCompact` 900px, `kosmoFull` 1400px을 사용해야 하며(MUST), 각 viewport에서 실제 목록·상세 surface가 Action Bar에 제공하는 콘텐츠 폭을 fixture로 사용해야 한다(MUST). 한국어·영어 locale의 표준 compact count 또는 count가 없는 액션이 있어도 각 액션의 icon, count 및 interactive target이 겹치지 않아야 한다(MUST).

#### Scenario: compact 폭

- **WHEN** Action Bar가 compact 게시글 콘텐츠 폭에 렌더된다
- **THEN** 표시 액션은 한 행과 고정 순서를 유지하며 최소 interactive target을 충족한다

#### Scenario: web 폭

- **WHEN** Action Bar가 넓은 Web 게시글 콘텐츠 폭에 렌더된다
- **THEN** 표시 액션은 늘어난 공간에 분배되지만 순서와 시각 계층은 compact 표현과 동일하다

#### Scenario: locale별 compact count

- **WHEN** Reply 또는 Repost에 한국어 또는 영어 locale의 compact count가 표시된다
- **THEN** Action Bar는 다른 액션과 겹치거나 행을 분리하지 않고 count를 표시한다

### Requirement: Production Post surface 배치

**Authority / Provenance:** `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/profile.md`, `docs/domain/README.md`, `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `PROD-432`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425`, `PROD-866` — 지원되는 Home Post List, Profile Post List 및 Post 상세 surface의 게시글은 공통 Post Action Bar 계약을 사용해야 한다(MUST). `PostLayout`은 Reaction Summary와 Action Bar를 포함하는 Engagement를 Post content grid의 마지막 presentation sibling으로 렌더링해야 하고(MUST), 일반 Text·Media `PostListItem`은 Action Bar만 담은 목록 전용 slot을 사용해야 하며(MUST), Quote와 순수 Repost `PostListItem`은 별도 slot 없이 Action Bar를 직접 배치해야 한다(MUST). Action Bar는 본문·작성자·생성 시각·Source navigation `Link`/`Pressable` 안에 중첩하지 않아야 한다(MUST NOT). direct Quote Source preview는 resting fill 없이 주변 Post background와 같은 평면을 유지하고 semantic border로 경계를 구분해야 하며(MUST), source navigation이 활성인 Web preview는 pointer hover 동안 root 전체에 semantic `stateHover` overlay를 사용해야 한다(MUST). `interactive=false` preview와 Native에는 Web hover fill을 투영하지 않아야 한다(MUST NOT). 일반 Post와 Quote는 다섯 액션 모두 바깥 Post를 target으로 공급해야 한다(MUST). 순수 Repost는 Reply에 바깥 contentless Repost binding과 disabled 상태를 유지하고(MUST), Repost·Reaction·Bookmark·More에는 화면에 표시한 direct Source Post를 target으로 공급해야 한다(MUST). surface는 display Post와 action별 target을 구분하면서 canonical 관계 조합, Post Visibility·권한 계약과 각 action 계약에서 target 자체의 적격성과 현재 실행 주체·세션의 실행 권한을 분리해 판단해야 한다(MUST). Action Bar child는 전달받은 policy input을 표현하되 대상 정책, guest 인증 진입 또는 Profile 선택 진입을 자체 판단하지 않아야 한다(MUST NOT). target Post가 적격하지 않거나 인증된 실행 주체가 실행 권한을 갖지 못한 액션은 config 또는 child action을 생략하지 않고 disabled 상태로 제공해야 한다(MUST). target 자체가 적격하면(MUST) `guest`는 기존 플랫폼 인증 진입으로 위임하고, `valid`인데 selected Profile이 없으면 `ShellChromeContext.openProfileSwitcher()`로 기존 Profile 선택기를 열며, `valid`이고 selected Profile이 있으면 action을 실행하고, `error`에서는 disabled로 유지해야 한다(MUST). 인증·Profile 선택 resolution 전에는 child UI나 mutation을 시작하지 않아야 하며(MUST NOT), Profile 선택 뒤 원래 action을 자동 재실행하지 않아야 한다(MUST NOT). `PostList`, route와 외부 caller는 Action Bar subtree나 `actionBar?: ReactNode` seam을 주입하지 않아야 하며(MUST NOT), surface 배치는 기존 상세 navigation 및 다른 interactive control의 입력을 가로채지 않아야 한다(MUST).

#### Scenario: 목록과 상세의 공통 계약

- **WHEN** 같은 Post가 지원되는 목록과 상세 surface에 표시된다
- **THEN** 두 surface는 같은 액션 순서, 상태 의미 및 접근성 계약의 Post Action Bar를 렌더한다

#### Scenario: content grid 마지막 sibling

- **WHEN** `PostListItem` 또는 `PostLayout`이 일반 Post, 순수 Repost 또는 Quote를 렌더한다
- **THEN** `PostLayout`의 Engagement는 마지막 presentation sibling으로 Reaction Summary와 Action Bar를 포함하고, `PostListItem`의 Action Bar는 마지막 presentation 뒤 목록 slot 또는 direct final sibling으로 렌더된다
- **AND** 일반 Text·Media의 목록 전용 slot은 Action Bar만 포함하고 Quote·순수 Repost는 Action Bar를 직접 배치한다
- **AND** 본문·작성자·생성 시각·Source navigation link의 descendant가 아니다

#### Scenario: 목록 Post 카드의 compact spacing

- **WHEN** `PostListItem`이 일반 Text·Media, 순수 Repost 또는 Quote를 렌더한다
- **THEN** 일반 Text·Media 카드는 상단 12px·하단 4px padding을 사용하고 목록 전용 Action Bar slot은 상단 4px·하단 0px padding을 제공한다
- **AND** 순수 Repost와 Quote 카드는 상단 8px·하단 1px padding을 사용하고 별도 Action Bar slot을 만들지 않는다
- **AND** 1px 카드 구분선은 입력·메뉴 외곽선용 `border`가 아니라 저강도 semantic `divider` color를 사용한다
- **AND** 순수 Repost attribution은 20px line box를 사용하고 아래 Source 표준행과의 추가 gap을 두지 않는다
- **AND** Quote는 Source preview 내부 하단 padding을 4px로 줄이고 Source preview border 밖에서 직접 배치한 Action Bar까지 8px 간격을 제공한다

#### Scenario: Quote Source preview surface state

- **WHEN** direct Quote Source preview가 Post 목록·상세 또는 Composer Parent에 렌더된다
- **THEN** preview는 resting fill 없이 주변 Post background를 그대로 보이고 semantic border를 유지한다
- **AND** source navigation이 활성인 Web preview는 pointer hover 동안 root 전체에 semantic `stateHover` overlay를 표시하고 leave 뒤 resting 상태로 돌아간다
- **AND** `interactive=false` preview와 Native는 Web hover fill을 표시하지 않는다

#### Scenario: 상세 PostLayout과 thread connector geometry

- **WHEN** Post 상세 thread가 조상, 현재 Post와 하위 Reply를 함께 렌더한다
- **THEN** 현재 `PostLayout`은 48px Avatar와 12px gap의 Header 뒤 8px 간격으로 Body를 full width에 배치하고 Engagement를 같은 왼쪽 경계와 너비에 배치한다
- **AND** Engagement는 full-width 상·하 1px `borderSubtle`, 상하 8px padding과 Reaction Summary→Action Bar 4px gap을 소유하며 이 geometry를 connector gutter로 사용하지 않는다
- **AND** current row는 왼쪽 8px·오른쪽 12px·상단 16px·하단 4px padding을 사용한다
- **AND** connector는 조상 구간과 마지막 조상→현재 경계에만 표시되고 현재→첫 하위 Reply와 하위 Reply 사이에는 표시되지 않는다
- **AND** current row 뒤에는 generic thread divider를 렌더링하지 않는다

#### Scenario: 상세 thread 현재 Post의 compact spacing

- **WHEN** Post 상세 thread의 현재 Post에 Reaction Summary와 다음 thread row가 함께 렌더되고 inline Reply Composer가 닫혀 있다
- **THEN** current row 상단부터 Post content까지 기존 16px 간격을 유지한다
- **AND** Reaction Summary와 Action Bar 사이에는 4px 간격이 있다
- **AND** selected Profile이 있어도 닫힌 Composer의 빈 wrapper와 margin을 렌더링하지 않는다
- **AND** Engagement 아래와 current row 끝 사이에는 4px 간격이 있고 current row 뒤 별도 thread divider는 없다
- **AND** Action Bar 자체의 28px geometry는 유지된다

#### Scenario: 순수 Repost의 Source action target

- **WHEN** Post에 Content와 Reply Parent가 없고 Repost Source만 있다
- **THEN** surface는 Reply에 바깥 contentless Repost identity와 disabled 상태를 유지한다
- **AND** Repost·Reaction·Bookmark·More에는 direct Source Post fragment를 action target으로 공급한다
- **AND** Repost child는 Source의 `repostCount`와 selected Profile의 `viewerRepost`에서 menu 상태와 mutation identity를 파생한다

#### Scenario: 대상 자체가 액션에 부적격

- **WHEN** Post를 조회할 수 있지만 Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 대상 관련 canonical 조건이 특정 액션의 대상 적격성을 허용하지 않는다
- **THEN** surface는 해당 액션을 숨기지 않고 disabled 상태로 렌더한다

#### Scenario: 인증된 실행 주체의 권한 부족

- **WHEN** 인증된 실행 주체가 대상 자체는 적격한 특정 액션의 canonical 실행 권한을 갖지 못한다
- **THEN** surface는 해당 액션을 숨기지 않고 disabled 상태로 렌더한다

#### Scenario: guest의 소셜 액션 활성화

- **WHEN** 인증하지 않은 guest가 조회할 수 있고 대상 자체가 적격한 Post의 Reply·Repost·Reaction·Bookmark를 활성화한다
- **THEN** surface는 `Account.Active`·`Profile.Member`·선택 Profile 부재만으로 해당 액션을 숨기거나 비활성화하지 않고 상위 인증·가입·온보딩 진입 callback에 위임한다
- **AND** child UI나 mutation을 먼저 시작하지 않는다

#### Scenario: valid 세션의 선택 Profile 부재

- **WHEN** session status가 `valid`이고 selected Profile이 없는 사용자가 대상 자체가 적격한 Reply·Repost·Reaction·Bookmark를 활성화한다
- **THEN** surface는 로그인으로 이동하지 않고 `ShellChromeContext.openProfileSwitcher()`로 기존 Profile 선택기를 연다
- **AND** child UI나 mutation을 먼저 시작하지 않는다
- **AND** Profile 선택 뒤 원래 action을 자동으로 재실행하지 않는다

#### Scenario: 세션 복원 오류

- **WHEN** session status가 `error`다
- **THEN** session이 필요한 Reply·Repost·Reaction·Bookmark는 disabled 상태를 유지한다
- **AND** navigation, child UI 또는 mutation을 시작하지 않는다

#### Scenario: guest에게도 대상 자체가 부적격

- **WHEN** 인증하지 않은 guest가 Post를 조회할 수 있지만 Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 대상 관련 canonical 조건상 특정 액션의 대상 적격성이 없다
- **THEN** surface는 인증 진입 callback을 호출하지 않고 해당 액션을 disabled 상태로 렌더한다

#### Scenario: 중첩 입력 경계

- **WHEN** 사용자가 Action Bar의 액션을 활성화한다
- **THEN** 해당 액션 입력만 처리되고 게시글 상세 navigation이나 인접 control은 함께 활성화되지 않는다

### Requirement: 실제 액션 상태 연결

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `docs/design/post-action-bar.md`, `docs/design/reply-composer.md`, `PROD-432`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425` — Production surface는 actual action target Post fragment ref와 Reply·Reaction·Bookmark의 기존 구현 결과에서 callback과 처리 상태를 공급해야 하며(MUST), PROD-425는 actual 목록·상세 surface에서 Reply에 외부 Composer의 controlled `expanded`를 공급하고 PROD-432는 이를 재구현하지 않고 전체 조합에서 유지해야 한다(MUST). Reaction에는 현재 Profile이 하나 이상의 Reaction Type을 남겼는지를 나타내는 `hasReacted`, Bookmark에는 현재 Profile의 `hasBookmarked`를 공급해야 한다(MUST). Repost child action은 target fragment의 `viewerRepost`에서 `hasReposted`, delete identity와 create/delete mutation 선택을 함께 파생해야 하고(MUST), PROD-414 surface는 target fragment ref와 action별 error callback을 공급해야 한다(MUST). Repost의 최종 disabled 행동을 연결할 concrete host input 또는 fragment shape는 actual production caller와 함께 PROD-432가 설계하고 통합 검증해야 한다(MUST). 범용 `selected`를 합성하거나 공개 입력으로 공급하지 않아야 하며(MUST NOT), Reaction과 Bookmark count는 공급하지 않아야 한다(MUST NOT). Reply count는 선행 action 계약이 제공하는 경우에만 optional로 공급하고 Repost count는 target child fragment에서 읽어야 하며(MUST), count 계약이 없는 액션에 `0`이나 새로운 집계 값을 합성하지 않아야 한다(MUST NOT). 제공된 count와 선택된 Profile에 상대적인 도메인 상태는 기존 cache 경계를 유지해야 하며(MUST), Profile 전환 시 이전 Profile의 상태를 재사용하지 않아야 한다(MUST). Bookmark 해제 성공은 현재 Relay actor Store에서 target Post의 `viewerBookmark`를 `null`로 정규화하고 해당 Bookmark record를 삭제하며(MUST), 로드된 `BookmarkConnectionList_bookmarks`에서 같은 Bookmark node의 edge를 제거해야 한다(MUST). 다른 actor Store의 Post·Bookmark·connection은 변경하지 않아야 한다(MUST NOT). 각 액션의 pending 상태는 해당 요청의 중복 입력만 차단해야 하며(MUST) 다른 액션을 불필요하게 차단하지 않아야 한다(MUST).

Reaction Type 선택·해제와 Type별 count·Profile 목록은 PROD-417·PROD-418의 공개 계약을 그대로 소비해야 하며(MUST) 이 Action Bar 계약에서 별도 집계 방식이나 Reaction count를 정의하지 않아야 한다(MUST). `hasReacted`는 현재 Profile이 하나 이상의 Reaction Type을 남겼는지만 나타내야 한다(MUST).

#### Scenario: 선택 Profile 전환

- **WHEN** 사용자가 같은 Post를 보는 동안 선택 Profile을 전환한다
- **THEN** 선행 계약이 제공한 Reply·Repost count는 공유 가능한 값을 유지하고 `hasReposted`·`hasReacted`·`hasBookmarked`는 새 Profile에 상대적인 값으로 갱신된다

#### Scenario: Reply Composer 연결

- **WHEN** 사용자가 Reply를 활성화한다
- **THEN** PROD-425 surface는 목록의 modal·전체 화면 또는 상세의 행별 inline Composer를 열거나 focus하고 Composer가 소유한 `expanded`를 Action Bar에 다시 공급한다
- **AND** PROD-432는 이 연결을 재구현하지 않고 guest 인증 위임과 전체 action 조합에서 유지한다

#### Scenario: 액션별 pending 경계

- **WHEN** 한 액션 요청이 pending이다
- **THEN** Action Bar는 해당 액션의 중복 입력만 차단하고 다른 활성 액션은 계속 사용할 수 있게 한다

#### Scenario: 성공한 요청 반영

- **WHEN** 연결된 action 요청이 성공한다
- **THEN** Production surface는 기존 action 계약이 제공하는 Reply count와 `hasReacted`·`hasBookmarked`를 공급하고 Repost child는 fragment가 제공하는 Repost count와 `hasReposted`를 반영한다

#### Scenario: Bookmark 해제 cache 동기화

- **WHEN** 현재 selected Profile이 target Post의 활성 Bookmark를 해제하고 서버 요청이 성공한다
- **THEN** 현재 Relay actor Store의 target Post는 `viewerBookmark: null`을 반영하고 해당 Bookmark record를 삭제한다
- **AND** 같은 actor Store에 로드된 `BookmarkConnectionList_bookmarks`는 해당 Bookmark node의 edge를 제거해 북마크 목록에서 row가 즉시 사라진다
- **AND** 다른 selected Profile의 actor Store는 변경하지 않는다

#### Scenario: 실패한 요청 복구

- **WHEN** 연결된 action 요청이 실패한다
- **THEN** production surface는 해당 액션의 pending을 종료하고 요청 직전의 확정된 `expanded`·`hasReposted`·`hasReacted`·`hasBookmarked`와 제공된 Reply·Repost count를 유지한다
- **AND** Repost 생성 실패는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`, 취소 실패는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`라는 toast로 안내하고 같은 내용을 보조 기술이 즉시 인식할 수 있게 한다
- **AND** Repost toast는 safe area와 고정 탭 바 위의 화면 하단에서 약 3초 뒤 사라지고 새 toast가 기존 toast를 교체한다
- **AND** 활성 toast와 같은 실패 문구가 다시 발생해도 새 alert instance로 교체하고 dismiss timer를 다시 시작해 보조 기술이 반복된 실패를 다시 인식할 수 있게 한다
- **AND** light toast는 `#262626` accent 배경을 사용하고 message line box·padding을 유지한 채 glyph를 2px 아래로 이동한다
- **AND** Action Bar에 지속 error 상태나 toast close·retry control을 공급하지 않고, 사용자가 Repost menu를 다시 열어 같은 항목을 선택하면 재시도할 수 있게 한다

### Requirement: More menu 통합

**Authority / Provenance:** `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-432`, `PROD-433`, `PROD-598`, `PROD-632` — Production surface는 `링크 복사`를 첫 `moreItems` 항목으로 제공해야 하고(MUST), composite Post fragment 아래 private `PostDeletionAction`은 접근 가능한 More menu를 열어 이 항목을 항상 첫 항목으로 유지해야 한다(MUST). selected Profile이 target Post의 Author Profile과 같고 target이 Content를 가진 Active Post일 때만 private child가 완료된 PROD-598의 destructive `삭제`를 마지막 항목으로 추가해야 하며(MUST), guest·다른 Profile·Tombstone·Content 없는 Repost target에는 `삭제`를 표시하지 않아야 한다(MUST NOT). 삭제 확인 dialog·mutation·Relay cache 동기화·실패 복구는 PROD-598의 완료 계약을 재사용해야 하며(MUST), 이 change가 삭제 domain·GraphQL·cache 계약을 다시 정의하지 않아야 한다(MUST NOT). Content가 있는 Post의 링크 복사는 Web 또는 browser origin을 제공하는 실행 환경에서는 현재 browser origin을, Android·iOS처럼 browser origin이 없는 클라이언트에서는 현재 deployment가 사용하는 configured Local Instance의 `canonical_origin`을 사용해 그 Post의 `/{relativeHandle}/{postId}` 경로와 결합한 query·hash 없는 절대 Post Share Reference를 clipboard에 복사해야 한다(MUST). Content와 Reply Parent 없이 Repost Source만 있는 Repost의 More target은 direct Repost Source여야 하며(MUST), 링크 복사는 Repost 자신의 상세 참조를 노출하지 않고 조회 가능한 direct Source의 Post Share Reference를 복사하고 삭제 자격과 mutation ID도 Source를 기준으로 해야 한다(MUST). Web은 현재 browser origin을 우선하고 Android·iOS는 configured Local Instance의 `canonical_origin`을 사용하되, 모두 같은 Post Share Reference 경로·direct Source 선택 규칙을 사용해야 한다(MUST). 클라이언트 설정은 Native 또는 browser origin 부재 시 configured Local Instance의 `canonical_origin`을 전달하는 projection이어야 하며(MUST) 독립적인 공유 링크 authority가 되지 않아야 한다(MUST NOT). Web의 configured origin은 현재 browser origin을 덮어쓰지 않아야 한다(MUST NOT). API origin이나 플랫폼 전용 native deep link를 공유 참조로 사용하지 않아야 하며(MUST), 인증하지 않은 guest도 조회할 수 있는 Post의 공유 참조를 복사할 수 있어야 한다(MUST). 링크 복사는 Post Visibility와 Post Eligibility가 허용하지 않은 조회 범위를 넓히지 않아야 한다(MUST). Toolbar container는 clipboard나 삭제 mutation payload·cache 계약을 직접 소유하지 않아야 하고(MUST NOT), private `PostDeletionAction`은 menu·확인 dialog·delete mutation 상태를 소유해야 한다(MUST).

#### Scenario: More 팝업 열기

- **WHEN** production surface에서 사용자가 More를 활성화한다
- **THEN** surface는 `링크 복사`를 첫 항목으로 가진 접근 가능한 팝업을 연다
- **AND** Web에서는 menu card 오른쪽이 trigger 오른쪽보다 5px 바깥에 있고 첫 item 오른쪽은 trigger 오른쪽과 맞아 menu가 왼쪽으로 펼쳐진다
- **AND** 첫 item의 확장 target은 trigger pointer 지점을 덮고 menu는 viewport 안으로 보정되며, Repost의 기존 시작 정렬과 Native bottom action sheet는 유지된다

#### Scenario: 작성자의 삭제 action 조합

- **WHEN** selected Profile이 Content를 가진 Active target Post의 Author Profile과 같다
- **THEN** More menu는 첫 항목 `링크 복사` 뒤 마지막 항목에 destructive `삭제`를 표시한다
- **AND** 삭제 선택 이후의 확인·mutation·cache·실패 동작은 PROD-598 계약을 사용한다

#### Scenario: 삭제 자격이 없는 More menu

- **WHEN** 사용자가 guest·다른 Profile이거나 target이 Tombstone 또는 Content 없는 Repost다
- **THEN** More menu는 `삭제`를 표시하지 않고 `링크 복사`만 제공한다

#### Scenario: guest 링크 복사

- **WHEN** 인증하지 않은 guest가 More 팝업의 `링크 복사`를 활성화한다
- **THEN** surface는 인증 진입을 요구하지 않고 canonical Post URL을 clipboard에 복사한다

#### Scenario: Content 없는 Repost 링크 복사

- **WHEN** Content와 Reply Parent 없이 Repost Source만 있는 Repost에서 사용자가 `링크 복사`를 활성화한다
- **THEN** surface는 Repost 자신의 상세 참조가 아니라 조회 가능한 직접 Repost Source의 Post Share Reference를 clipboard에 복사한다
- **AND** 같은 More menu의 삭제 자격과 mutation ID도 direct Source를 기준으로 한다

#### Scenario: Web과 Native의 동일한 공유 경로 규칙

- **WHEN** 같은 Post의 링크 복사를 Web과 Android 또는 iOS에서 각각 실행한다
- **THEN** Web은 현재 browser origin을, Android·iOS는 configured Local Instance의 canonical origin을 사용해 절대 URL을 결정한다
- **AND** 두 플랫폼은 같은 Post Share Reference 경로와 direct Source 선택 규칙을 적용한다
- **AND** 복사된 URL에는 query나 hash가 포함되지 않는다

#### Scenario: Web이 Local Instance canonical origin과 다른 Host에서 실행됨

- **WHEN** Web의 현재 browser origin이 configured Local Instance의 `canonical_origin`과 다른 preview 또는 별도 Host다
- **THEN** Web은 configured origin으로 덮어쓰지 않고 현재 browser origin으로 Post Share Reference를 복사한다

#### Scenario: Browser origin이 없는 클라이언트

- **WHEN** Android·iOS 또는 browser origin을 제공하지 않는 실행 환경에서 사용자가 `링크 복사`를 활성화한다
- **THEN** surface는 configured Local Instance의 `canonical_origin`을 사용해 Post Share Reference를 복사한다

### Requirement: 상태 카탈로그와 통합 검증

**Authority / Provenance:** `docs/design/post-action-bar.md`, `docs/design/post-thread.md`, `PROD-432`, `PROD-433`, `PROD-414`, `PROD-866`, `PROD-882` — 공통 UI 구현은 Reply `expanded`, Repost child가 fragment에서 파생한 `hasReposted`, Reaction `hasReacted`, Bookmark `hasBookmarked`, config 기반 Reply·Reaction·Bookmark의 default·pending·disabled와 Repost child의 default·pending, active Reaction·Bookmark의 채워진 icon, canonical Repost·Reaction action colors, HeartPlus·Bookmark+More trailing group, 선택적 액션, count 및 지원 폭을 독립적으로 검토할 수 있는 Storybook 상태 카탈로그를 제공해야 한다(MUST). 대표 Light·Dark Web 상태에서 Repost의 미선택 중립색·hover glyph와 중립 count·selected glyph와 count, Reaction active·hover semantic 색상을 직접 검증해야 한다(MUST). Playground는 실제 Controls·Actions·Interactions와 representative Web 상태를 제공해야 하고(MUST), production More menu, PostListItem variant spacing, PostLayout full-width geometry와 thread connector 생략을 production fixture에서 검증해야 한다(MUST). Repost Storybook은 actual Relay operation의 target fragment ref를 `PostActionBar` parent fragment에서 private Repost child fragment까지 전달하고(MUST), menu open·dismiss·항목 선택·pending·mutation·오류 callback을 검증해야 한다(MUST). PROD-414 integration은 일반 Post·순수 Repost·Quote 목록과 상세의 final sibling·link 비중첩, 순수 Repost Source target, Web anchored menu·Native bottom sheet, exact failure toast와 이전 상태 유지·재시도를 검증해야 한다(MUST). PROD-432의 계약 부모 통합 검증은 준비된 나머지 action, 최종 disabled·guest 정책, More 링크 복사와 전체 action 조합을 검증해야 한다(MUST).

#### Scenario: UI 상태 독립 검토

- **WHEN** 리뷰어가 Post Action Bar Storybook을 연다
- **THEN** production backend 없이 필수 시각 상태, 선택적 구성 및 지원 폭을 검토할 수 있다

#### Scenario: 컴포넌트 입력 검증

- **WHEN** component test가 default·pending·disabled 액션을 활성화한다
- **THEN** default 상태는 callback을 한 번 호출하고 pending·disabled 상태는 callback을 호출하지 않는다

#### Scenario: 최종 통합 검증

- **WHEN** 모든 구현 자식과 선행 action 계약이 완료된다
- **THEN** 계약 부모는 목록·상세에서 실제 상태 연결과 전체 실패 복구 흐름을 검증한다
