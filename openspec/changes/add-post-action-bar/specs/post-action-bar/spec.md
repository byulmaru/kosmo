## ADDED Requirements

### Requirement: 고정된 액션 구성

**Authority / Provenance:** `PROD-432`, `PROD-433` — Post Action Bar는 표시하도록 제공된 액션을 Reply → Repost → Reaction → Bookmark → More 순서의 단일 행으로 렌더해야 한다(MUST). 액션별 설정이 제공되지 않으면 해당 위치를 렌더하지 않아야 하며(MUST), 남은 액션의 상대 순서는 바꾸지 않아야 한다(MUST). 지원되는 production Post surface는 다섯 액션 설정을 모두 제공해야 하며(MUST), Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 권한 때문에 실행할 수 없는 액션도 생략하지 않고 disabled 상태로 제공해야 한다(MUST). More는 icon-only 액션이어야 하며(MUST) count나 의미적 선택·처리 상태를 자체적으로 제공하지 않아야 한다(MUST).

#### Scenario: 모든 액션 표시

- **WHEN** 다섯 액션의 설정이 모두 제공된다
- **THEN** Action Bar는 Reply, Repost, Reaction, Bookmark, More 순서로 렌더한다

#### Scenario: 독립 컴포넌트의 선택적 액션 생략

- **WHEN** production Post surface가 아닌 독립 컴포넌트 사용에서 일부 액션의 설정이 제공되지 않는다
- **THEN** Action Bar는 해당 액션을 숨기고 제공된 액션의 상대 순서를 유지한다

#### Scenario: More 표시

- **WHEN** More 설정과 callback이 제공된다
- **THEN** Action Bar는 접근 가능한 icon-only More 버튼을 표시하고 메뉴나 링크 복사 동작은 실행하지 않는다

### Requirement: 액션의 시각 상태

**Authority / Provenance:** `PROD-433`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425` — Reply·Repost·Reaction·Bookmark는 처리 상태를 받아야 하며(MUST), 공개 제품 상태는 Reply의 controlled `expanded`, Repost의 `hasReposted`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`로 처리 상태와 독립적으로 받아야 한다(MUST). 범용 `selected`를 공개 prop으로 제공하지 않아야 하며(MUST NOT), Reaction은 count를 받지 않아야 한다(MUST NOT). default 상태는 보조 텍스트 색상의 icon과 Reaction을 제외한 선택적 count를 표시해야 하고(MUST), 활성인 도메인 상태는 primary 색상의 icon으로 표현해야 한다(MUST). 처리 상태의 시각 표현은 도메인 상태의 primary 표현보다 우선해야 한다(MUST). pending 상태는 icon 자리에 spinner를 표시하고(MUST), disabled 상태는 icon과 제공된 count를 비활성 표현으로 약화해야 하며(MUST), error 상태는 icon과 제공된 count를 danger 색상으로 표시해야 한다(MUST). pending·disabled·error 중에도 `expanded`·`hasReposted`·`hasReacted`·`hasBookmarked`의 의미와 접근성 상태를 잃지 않아야 한다(MUST). More는 callback과 접근성 label만 받아야 하며(MUST) count·도메인 상태·pending·disabled·error 입력을 받지 않아야 한다(MUST).

#### Scenario: 활성인 도메인 상태

- **WHEN** Repost의 `hasReposted`, Reaction의 `hasReacted` 또는 Bookmark의 `hasBookmarked`가 true이고 처리 상태가 default다
- **THEN** Action Bar는 해당 icon을 primary 색상으로 표시하고 도메인 의미를 접근성 상태로 노출한다

#### Scenario: 활성인 도메인 상태의 처리 중 상태

- **WHEN** 활성인 도메인 상태를 가진 액션의 처리 상태가 pending으로 바뀐다
- **THEN** Action Bar는 icon 자리에 spinner를 표시하면서 해당 도메인 의미의 접근성 상태를 유지한다

#### Scenario: 활성인 도메인 상태의 비활성 상태

- **WHEN** 활성인 도메인 상태를 가진 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 primary 대신 비활성 표현을 사용하고 입력을 차단하면서 도메인 의미와 disabled 접근성 상태를 함께 유지한다

#### Scenario: 활성인 도메인 상태의 실패 상태

- **WHEN** 활성인 도메인 상태를 가진 액션의 처리 상태가 error다
- **THEN** Action Bar는 primary 대신 danger 표현을 사용하면서 도메인 의미의 접근성 상태와 재시도 의도를 유지한다

#### Scenario: Reply Composer의 controlled 상태

- **WHEN** 외부 Reply Composer가 열리거나 닫히며 `expanded`가 변경된다
- **THEN** Action Bar는 값을 자체 전환하지 않고 전달받은 `expanded`를 Reply의 시각·접근성 상태에 반영한다

#### Scenario: 비활성 상태

- **WHEN** 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 icon과 count를 비활성 표현으로 표시한다

#### Scenario: 실패 상태

- **WHEN** 액션의 마지막 요청이 실패해 처리 상태가 error다
- **THEN** Action Bar는 icon과 count를 danger 색상으로 표시하고 재시도 가능한 상태임을 나타낸다

### Requirement: 액션 입력 계약

**Authority / Provenance:** `PROD-432`, `PROD-433` — Action Bar는 각 표시 액션의 callback을 외부에서 받아야 하며(MUST) 자체적으로 navigation, menu, mutation, Composer 상태 또는 cache 갱신을 수행하지 않아야 한다(MUST). Reply·Repost·Reaction·Bookmark의 default·error 상태는 도메인 상태 값과 관계없이 사용자 입력 시 callback을 한 번 호출해야 한다(MUST). 이 액션들의 pending·disabled 상태는 touch, pointer 및 keyboard 입력을 차단하고 callback을 호출하지 않아야 한다(MUST). More는 사용자 입력 시 상태 전이 없이 callback을 한 번 호출해야 한다(MUST).

#### Scenario: 기본 액션 실행

- **WHEN** 사용자가 default 상태이거나 도메인 상태가 활성인 액션을 활성화한다
- **THEN** Action Bar는 해당 액션 callback을 한 번 호출한다

#### Scenario: 처리 중 중복 입력 차단

- **WHEN** 사용자가 pending 상태의 액션을 다시 활성화한다
- **THEN** Action Bar는 입력을 차단하고 callback을 호출하지 않는다

#### Scenario: 비활성 입력 차단

- **WHEN** 사용자가 disabled 상태의 액션을 활성화하려 한다
- **THEN** Action Bar는 callback을 호출하지 않는다

#### Scenario: 실패 후 재시도

- **WHEN** 사용자가 error 상태의 액션을 활성화한다
- **THEN** Action Bar는 같은 액션 callback을 한 번 호출해 상위 계층이 재시도할 수 있게 한다

#### Scenario: More callback 실행

- **WHEN** 사용자가 More를 활성화한다
- **THEN** Action Bar는 More callback을 한 번 호출하고 메뉴나 clipboard 동작을 자체 수행하지 않는다

### Requirement: 액션 접근성

**Authority / Provenance:** `PROD-433` — 표시되는 각 액션은 button role과 액션별 label을 노출해야 하며(MUST) 시각 icon이나 count에만 의미를 의존하지 않아야 한다(MUST). 액션은 시각 크기와 별도로 최소 44×44 interactive target을 가져야 한다(MUST). Reply의 `expanded`, Repost의 `hasReposted`, Reaction의 `hasReacted`, Bookmark의 `hasBookmarked`와 각 액션의 pending·disabled 상태는 플랫폼에서 지원하는 접근성 state로 노출해야 하며(MUST), error 상태는 label 또는 hint로 재시도 의도를 전달해야 한다(MUST). 이 접근성 매핑 내부에서는 플랫폼의 `selected`·`pressed`·`expanded` 용어를 사용할 수 있지만 공개 제품 prop 이름을 바꾸지 않아야 한다(MUST). More는 button role과 label을 제공하되 도메인 상태 또는 처리 상태를 노출하지 않아야 한다(MUST).

#### Scenario: 보조 기술로 액션 탐색

- **WHEN** 보조 기술 사용자가 Action Bar를 탐색한다
- **THEN** 각 표시 액션은 고유한 label을 가진 button으로 노출된다

#### Scenario: 도메인 상태와 처리 상태 전달

- **WHEN** 액션의 도메인 상태가 활성이고 처리 상태가 pending이다
- **THEN** 보조 기술은 해당 도메인 의미와 busy 상태를 함께 인식할 수 있다

#### Scenario: 비활성 상태 전달

- **WHEN** 액션이 disabled다
- **THEN** 보조 기술은 액션이 비활성임을 인식할 수 있다

#### Scenario: 최소 입력 영역

- **WHEN** Action Bar가 지원하는 compact 폭에 렌더된다
- **THEN** 각 표시 액션은 최소 44×44 interactive target을 유지한다

### Requirement: Compact count 표시

**Authority / Provenance:** `PROD-432`, `PROD-433` — Action Bar는 Reaction과 More를 제외한 액션에 선행 계약이 제공한 0 이상의 정수 count만 표시해야 하며(MUST), 실행 환경 locale을 사용하는 표준 compact number formatting 결과를 사용해야 한다(MUST). Action Bar는 K/M 단위, 반올림 경계, 단위 승격 또는 표시 상한을 자체 알고리즘으로 재구현하지 않아야 하며(MUST NOT), locale에 따른 단위와 반올림 결과를 이 OpenSpec에서 별도로 고정하지 않아야 한다(MUST NOT). Reaction은 count 입력을 받거나 표시하지 않아야 하며(MUST NOT), count 계약이 없거나 값이 제공되지 않은 액션에 `0` 또는 placeholder를 합성하지 않아야 한다(MUST NOT).

#### Scenario: 실행 환경 locale의 compact 표시

- **WHEN** non-Reaction 액션에 count가 제공되고 실행 환경 locale이 한국어 또는 영어다
- **THEN** Action Bar는 해당 locale의 표준 compact number formatting 결과를 표시한다

#### Scenario: Reaction count 제외

- **WHEN** Reaction 설정이 제공된다
- **THEN** Action Bar는 Reaction count를 입력받거나 렌더하지 않는다

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

- **WHEN** 하나 이상의 non-Reaction 액션에 한국어 또는 영어 locale의 compact count가 표시된다
- **THEN** Action Bar는 다른 액션과 겹치거나 행을 분리하지 않고 count를 표시한다

### Requirement: Production Post surface 배치

**Authority / Provenance:** `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `docs/domain/objects/profile.md`, `docs/domain/README.md`, `PROD-432`, `PROD-434`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425` — 지원되는 Home Post List, Profile Post List 및 Post 상세 surface의 게시글은 공통 Post Action Bar 계약을 사용해야 한다(MUST). surface adapter는 canonical Content·Reply Parent·Repost Source 관계 조합, Post Visibility·권한 계약과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 action 계약에서 대상 Post 자체의 액션 적격성과 현재 실행 주체·세션의 실행 권한을 분리해 판단해야 하고(MUST), Action Bar가 정책을 자체 판단하게 하지 않아야 한다(MUST). 대상 Post가 적격하지 않거나 인증된 실행 주체가 실행 권한을 갖지 못한 액션은 설정을 생략하지 않고 disabled 상태로 제공해야 한다(MUST). 인증하지 않은 guest에게 `Account.Active`·`Profile.Member`·선택 Profile 같은 현재 세션 전제가 없다는 이유만으로 조회 가능하고 대상 자체가 적격한 액션을 disabled로 제공해서는 안 되며(MUST NOT), 활성화는 상위 인증 진입 callback에 위임해야 한다(MUST). surface 배치는 게시글의 기존 상세 navigation 및 다른 interactive control의 입력을 가로채지 않아야 한다(MUST).

#### Scenario: 목록과 상세의 공통 계약

- **WHEN** 같은 Post가 지원되는 목록과 상세 surface에 표시된다
- **THEN** 두 surface는 같은 액션 순서, 상태 의미 및 접근성 계약의 Post Action Bar를 렌더한다

#### Scenario: Content 없는 Repost의 액션 제한

- **WHEN** Post에 Content와 Reply Parent가 없고 Repost Source만 있다
- **THEN** surface는 Reply와 Repost를 렌더하되 disabled로 제공하고 Reaction·Bookmark·More는 다른 정책이 허용하는 상태를 유지한다

#### Scenario: 대상 자체가 액션에 부적격

- **WHEN** Post를 조회할 수 있지만 Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 대상 관련 canonical 조건이 특정 액션의 대상 적격성을 허용하지 않는다
- **THEN** surface는 해당 액션을 숨기지 않고 disabled 상태로 렌더한다

#### Scenario: 인증된 실행 주체의 권한 부족

- **WHEN** 인증된 실행 주체가 대상 자체는 적격한 특정 액션의 canonical 실행 권한을 갖지 못한다
- **THEN** surface는 해당 액션을 숨기지 않고 disabled 상태로 렌더한다

#### Scenario: guest의 소셜 액션 활성화

- **WHEN** 인증하지 않은 guest가 조회할 수 있고 대상 자체가 적격한 Post의 Reply·Repost·Reaction·Bookmark를 활성화한다
- **THEN** surface는 `Account.Active`·`Profile.Member`·선택 Profile 부재만으로 해당 액션을 숨기거나 비활성화하지 않고 상위 인증·가입·온보딩 진입 callback에 위임한다

#### Scenario: guest에게도 대상 자체가 부적격

- **WHEN** 인증하지 않은 guest가 Post를 조회할 수 있지만 Content·Reply Parent·Repost Source 관계 조합, Post Visibility 또는 대상 관련 canonical 조건상 특정 액션의 대상 적격성이 없다
- **THEN** surface는 인증 진입 callback을 호출하지 않고 해당 액션을 disabled 상태로 렌더한다

#### Scenario: 중첩 입력 경계

- **WHEN** 사용자가 Action Bar의 액션을 활성화한다
- **THEN** 해당 액션 입력만 처리되고 게시글 상세 navigation이나 인접 control은 함께 활성화되지 않는다

### Requirement: 실제 액션 상태 연결

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/bookmark.md`, `PROD-432`, `PROD-414`, `PROD-417`, `PROD-418`, `PROD-420`, `PROD-425` — Production surface는 Reply·Repost·Reaction·Bookmark의 기존 구현 결과에서 callback과 처리 상태를 공급해야 하고(MUST), Reply에는 외부 Composer의 controlled `expanded`, Repost에는 현재 Profile의 `hasReposted`, Reaction에는 현재 Profile이 하나 이상의 Reaction Type을 남겼는지를 나타내는 `hasReacted`, Bookmark에는 현재 Profile의 `hasBookmarked`를 공급해야 한다(MUST). 범용 `selected`를 합성하거나 공개 입력으로 공급하지 않아야 한다(MUST NOT). Reaction count는 공급하지 않아야 하며(MUST NOT), 다른 액션의 count는 선행 action 계약이 viewer-independent count를 제공하는 경우에만 optional로 공급해야 하고(MUST), count 계약이 없는 액션에 `0`이나 새로운 집계 값을 합성하지 않아야 한다(MUST NOT). 제공된 count와 선택된 Profile에 상대적인 도메인 상태는 기존 cache 경계를 유지해야 하며(MUST), Profile 전환 시 이전 Profile의 `hasReposted`·`hasReacted`·`hasBookmarked`를 재사용하지 않아야 한다(MUST). 각 액션의 pending 상태는 해당 요청의 중복 입력만 차단해야 하며(MUST) 다른 액션을 불필요하게 차단하지 않아야 한다(MUST).

Reaction Type 선택·해제와 Type별 count·Profile 목록은 PROD-417·PROD-418의 공개 계약을 그대로 소비해야 하며(MUST) 이 Action Bar 계약에서 별도 집계 방식이나 Reaction count를 정의하지 않아야 한다(MUST). `hasReacted`는 현재 Profile이 하나 이상의 Reaction Type을 남겼는지만 나타내야 한다(MUST).

#### Scenario: 선택 Profile 전환

- **WHEN** 사용자가 같은 Post를 보는 동안 선택 Profile을 전환한다
- **THEN** 선행 계약이 제공한 non-Reaction count는 공유 가능한 값을 유지하고 `hasReposted`·`hasReacted`·`hasBookmarked`는 새 Profile에 상대적인 값으로 갱신된다

#### Scenario: Reply Composer 연결

- **WHEN** 사용자가 Reply를 활성화한다
- **THEN** surface는 상위 Composer를 열거나 focus하고 Composer가 소유한 `expanded`를 Action Bar에 다시 공급한다

#### Scenario: 액션별 pending 경계

- **WHEN** 한 액션 요청이 pending이다
- **THEN** Action Bar는 해당 액션의 중복 입력만 차단하고 다른 활성 액션은 계속 사용할 수 있게 한다

#### Scenario: 성공한 요청 반영

- **WHEN** 연결된 action 요청이 성공한다
- **THEN** Production surface는 기존 action 계약이 제공하는 non-Reaction count와 `hasReposted`·`hasReacted`·`hasBookmarked`만 Action Bar에 반영한다

#### Scenario: 실패한 요청 복구

- **WHEN** 연결된 action 요청이 실패한다
- **THEN** Action Bar는 해당 액션을 error 상태로 표시하고 사용자가 같은 액션을 재시도할 수 있게 한다

### Requirement: More 링크 복사 통합

**Authority / Provenance:** `docs/domain/decisions/0015-post-share-reference.md`, `docs/domain/objects/post.md`, `PROD-432`, `PROD-433` — Production surface는 More callback이 활성화되면 접근 가능한 팝업을 열고(MUST) 현재 범위에서는 `링크 복사` 항목 하나를 제공해야 한다(MUST). 링크 복사는 canonical Web origin과 `/{relativeHandle}/{postId}` 경로를 결합한 query·hash 없는 절대 Post Share Reference를 clipboard에 복사해야 하며(MUST), Web은 현재 browser origin을, Android·iOS는 검증된 `EXPO_PUBLIC_WEB_ORIGIN`을 사용해야 한다(MUST). API origin이나 플랫폼 전용 native deep link를 공유 참조로 사용하지 않아야 하며(MUST), 인증하지 않은 guest도 조회할 수 있는 Post의 공유 참조를 복사할 수 있어야 한다(MUST). 링크 복사는 Post Visibility와 Post Eligibility가 허용하지 않은 조회 범위를 넓히지 않아야 한다(MUST). PostActionBar 컴포넌트는 팝업, clipboard 또는 메뉴 상태를 직접 소유하지 않아야 하며(MUST), 링크 복사 외의 More 항목은 이 change에 포함하지 않아야 한다(MUST).

#### Scenario: More 팝업 열기

- **WHEN** production surface에서 사용자가 More를 활성화한다
- **THEN** surface는 `링크 복사` 항목 하나를 가진 접근 가능한 팝업을 연다

#### Scenario: guest 링크 복사

- **WHEN** 인증하지 않은 guest가 More 팝업의 `링크 복사`를 활성화한다
- **THEN** surface는 인증 진입을 요구하지 않고 canonical Post URL을 clipboard에 복사한다

#### Scenario: Web과 Native의 동일한 공유 URL

- **WHEN** 같은 Post의 링크 복사를 Web과 Android 또는 iOS에서 각각 실행한다
- **THEN** 두 플랫폼은 같은 canonical web origin과 `/{relativeHandle}/{postId}` 경로의 절대 URL을 복사한다
- **AND** 복사된 URL에는 query나 hash가 포함되지 않는다

### Requirement: 상태 카탈로그와 통합 검증

**Authority / Provenance:** `PROD-432`, `PROD-433`, `PROD-434` — 공통 UI 구현은 Reply `expanded`, Repost `hasReposted`, Reaction `hasReacted`, Bookmark `hasBookmarked`와 각 액션의 default·pending·disabled·error 조합, More callback-only, 선택적 액션, Reaction count 제외, non-Reaction count 유무, 한국어·영어 locale의 compact count 및 지원 폭을 독립적으로 검토할 수 있는 Storybook 상태 카탈로그를 제공해야 한다(MUST). 구현 자식의 component test는 표시 우선순위·입력 차단·재시도·접근성 metadata를 검증해야 하며(MUST), 계약 부모의 통합 검증은 실제 Post surface에서 controlled Reply Composer, Profile 전환, action별 pending, 성공·실패 복구, disabled action 유지, guest 인증 위임 및 More 링크 복사를 검증해야 한다(MUST).

#### Scenario: UI 상태 독립 검토

- **WHEN** 리뷰어가 Post Action Bar Storybook을 연다
- **THEN** production backend 없이 필수 시각 상태, 선택적 구성 및 지원 폭을 검토할 수 있다

#### Scenario: 컴포넌트 입력 검증

- **WHEN** component test가 pending·disabled·error 액션을 활성화한다
- **THEN** 차단 상태는 callback을 호출하지 않고 error 상태는 재시도 callback을 호출한다

#### Scenario: 최종 통합 검증

- **WHEN** 모든 구현 자식과 선행 action 계약이 완료된다
- **THEN** 계약 부모는 목록·상세에서 실제 상태 연결과 전체 실패 복구 흐름을 검증한다
