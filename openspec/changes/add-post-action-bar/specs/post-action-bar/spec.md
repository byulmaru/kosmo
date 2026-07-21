## ADDED Requirements

### Requirement: 고정된 액션 구성

Post Action Bar는 표시하도록 제공된 액션을 Reply → Repost → Reaction → Bookmark → More 순서의 단일 행으로 렌더해야 한다(MUST). 액션별 설정이 제공되지 않으면 해당 위치를 렌더하지 않아야 하며(MUST), 남은 액션의 상대 순서는 바꾸지 않아야 한다(MUST). 지원되는 production Post surface는 다섯 액션 설정을 모두 제공해야 하며(MUST), Post Kind·Post Visibility·권한 때문에 실행할 수 없는 액션도 생략하지 않고 disabled 상태로 제공해야 한다(MUST). More는 icon-only 액션이어야 하며(MUST) count나 의미적 선택·처리 상태를 자체적으로 제공하지 않아야 한다(MUST).

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

Reply·Repost·Reaction·Bookmark는 처리 상태를 받아야 하며(MUST), Repost·Bookmark와 PROD-417·PROD-418의 공개 계약이 selected 의미를 제공한 Reaction만 선택 여부를 처리 상태와 독립적으로 받아야 한다(MUST). Reply는 지속적인 selected 의미를 제공하지 않아야 한다(MUST). default 상태는 보조 텍스트 색상의 icon과 선택적 count를 표시해야 하고(MUST), selected 상태를 지원하는 액션은 primary 색상의 icon으로 선택을 표현해야 한다(MUST). 처리 상태의 시각 표현은 selected의 primary 표현보다 우선해야 한다(MUST). pending 상태는 icon 자리에 spinner를 표시하고(MUST), disabled 상태는 icon과 count를 비활성 표현으로 약화해야 하며(MUST), error 상태는 icon과 count를 danger 색상으로 표시해야 한다(MUST). selected를 지원하는 액션은 pending·disabled·error 중에도 selected의 의미와 접근성 상태를 잃지 않아야 한다(MUST). More는 callback과 접근성 label만 받아야 하며(MUST) count·selected·pending·disabled·error 입력을 받지 않아야 한다(MUST).

#### Scenario: 선택된 액션

- **WHEN** selected를 지원하는 액션이 selected이고 처리 상태가 default다
- **THEN** Action Bar는 해당 icon을 primary 색상으로 표시하고 선택 상태를 노출한다

#### Scenario: 선택된 액션의 처리 중 상태

- **WHEN** selected 액션의 처리 상태가 pending으로 바뀐다
- **THEN** Action Bar는 icon 자리에 spinner를 표시하면서 접근성 selected 상태를 유지한다

#### Scenario: 선택된 액션의 비활성 상태

- **WHEN** selected 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 primary 대신 비활성 표현을 사용하고 입력을 차단하면서 접근성 selected와 disabled 상태를 함께 유지한다

#### Scenario: 선택된 액션의 실패 상태

- **WHEN** selected 액션의 처리 상태가 error다
- **THEN** Action Bar는 primary 대신 danger 표현을 사용하면서 접근성 selected 상태와 재시도 의도를 유지한다

#### Scenario: 비활성 상태

- **WHEN** 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 icon과 count를 비활성 표현으로 표시한다

#### Scenario: 실패 상태

- **WHEN** 액션의 마지막 요청이 실패해 처리 상태가 error다
- **THEN** Action Bar는 icon과 count를 danger 색상으로 표시하고 재시도 가능한 상태임을 나타낸다

### Requirement: 액션 입력 계약

Action Bar는 각 표시 액션의 callback을 외부에서 받아야 하며(MUST) 자체적으로 navigation, menu, mutation 또는 cache 갱신을 수행하지 않아야 한다(MUST). Reply·Repost·Reaction·Bookmark의 default·error 상태와 selected를 지원하는 액션의 selected 상태는 사용자 입력 시 callback을 한 번 호출해야 한다(MUST). 이 액션들의 pending·disabled 상태는 touch, pointer 및 keyboard 입력을 차단하고 callback을 호출하지 않아야 한다(MUST). More는 사용자 입력 시 상태 전이 없이 callback을 한 번 호출해야 한다(MUST).

#### Scenario: 기본 액션 실행

- **WHEN** 사용자가 default 또는 selected 상태의 액션을 활성화한다
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

표시되는 각 액션은 button role과 액션별 label을 노출해야 하며(MUST) 시각 icon이나 count에만 의미를 의존하지 않아야 한다(MUST). 액션은 시각 크기와 별도로 최소 44×44 interactive target을 가져야 한다(MUST). Reply·Repost·Reaction·Bookmark의 pending·disabled 상태와 selected를 지원하는 액션의 selected 상태는 플랫폼에서 지원하는 접근성 state로 노출해야 하며(MUST), error 상태는 label 또는 hint로 재시도 의도를 전달해야 한다(MUST). More는 button role과 label을 제공하되 의미적 selected 또는 처리 상태를 노출하지 않아야 한다(MUST).

#### Scenario: 보조 기술로 액션 탐색

- **WHEN** 보조 기술 사용자가 Action Bar를 탐색한다
- **THEN** 각 표시 액션은 고유한 label을 가진 button으로 노출된다

#### Scenario: 선택 및 처리 상태 전달

- **WHEN** 액션이 selected이면서 pending이다
- **THEN** 보조 기술은 선택 상태와 busy 상태를 함께 인식할 수 있다

#### Scenario: 비활성 상태 전달

- **WHEN** 액션이 disabled다
- **THEN** 보조 기술은 액션이 비활성임을 인식할 수 있다

#### Scenario: 최소 입력 영역

- **WHEN** Action Bar가 지원하는 compact 폭에 렌더된다
- **THEN** 각 표시 액션은 최소 44×44 interactive target을 유지한다

### Requirement: Compact count 표시

Action Bar는 More를 제외한 액션에 제공된 0 이상의 정수 count를 최대 네 글자의 compact 문자열로 표시해야 한다(MUST). 0부터 999까지는 정수를 그대로 표시하고(MUST), 1,000 이상 1,000,000 미만은 K, 1,000,000 이상은 M 단위를 사용해야 한다(MUST). 단위 값이 10 미만일 때만 소수점 한 자리를 반올림해 표시하고(MUST), 그 이상은 정수로 반올림하며(MUST), `.0`은 생략해야 한다(MUST). K 단위 반올림 결과가 1,000K에 도달하면 M 단위로 승격해야 하고(MUST), M 단위 반올림 결과가 1,000M에 도달하거나 원본 count가 1,000,000,000 이상이면 `999M`으로 상한 표시해야 한다(MUST).

#### Scenario: K 단위 표시

- **WHEN** count가 1,234 또는 12,345다
- **THEN** Action Bar는 각각 `1.2K`, `12K`를 표시한다

#### Scenario: M 단위 표시

- **WHEN** count가 1,234,567 또는 12,345,678이다
- **THEN** Action Bar는 각각 `1.2M`, `12M`을 표시한다

#### Scenario: 표시 상한

- **WHEN** count가 1,000,000,000 이상이다
- **THEN** Action Bar는 최대 네 글자인 `999M`을 표시한다

### Requirement: 반응형 배치

Action Bar는 mobile·compact·full의 지원 폭에서 액션을 한 행에 배치해야 하고(MUST) 줄바꿈이나 순서 변경 없이 사용 가능한 가로 공간에 분배해야 한다(MUST). 이 change의 필수 폭 검증은 기존 Storybook viewport인 `kosmoMobile` 390px, `kosmoCompact` 900px, `kosmoFull` 1400px을 사용해야 하며(MUST), 각 viewport에서 실제 목록·상세 surface가 Action Bar에 제공하는 콘텐츠 폭을 fixture로 사용해야 한다(MUST). 최대 네 글자의 compact count 또는 count가 없는 액션이 있어도 각 액션의 icon, count 및 interactive target이 겹치지 않아야 한다(MUST).

#### Scenario: compact 폭

- **WHEN** Action Bar가 compact 게시글 콘텐츠 폭에 렌더된다
- **THEN** 표시 액션은 한 행과 고정 순서를 유지하며 최소 interactive target을 충족한다

#### Scenario: web 폭

- **WHEN** Action Bar가 넓은 Web 게시글 콘텐츠 폭에 렌더된다
- **THEN** 표시 액션은 늘어난 공간에 분배되지만 순서와 시각 계층은 compact 표현과 동일하다

#### Scenario: 최대 길이 count

- **WHEN** 하나 이상의 액션에 네 글자 compact count가 표시된다
- **THEN** Action Bar는 다른 액션과 겹치거나 행을 분리하지 않고 count를 표시한다

### Requirement: Production Post surface 배치

지원되는 Home Post List, Profile Post List 및 Post 상세 surface의 게시글은 공통 Post Action Bar 계약을 사용해야 한다(MUST). surface는 canonical Post Kind·Post Visibility·권한 계약과 PROD-414·PROD-417·PROD-418·PROD-420·PROD-425의 action 계약이 허용 여부를 판단하게 하고(MUST), Action Bar가 정책을 자체 판단하게 하지 않아야 한다(MUST). 실행할 수 없는 액션은 설정을 생략하지 않고 disabled 상태로 제공해야 한다(MUST). surface 배치는 게시글의 기존 상세 navigation 및 다른 interactive control의 입력을 가로채지 않아야 한다(MUST).

#### Scenario: 목록과 상세의 공통 계약

- **WHEN** 같은 Post가 지원되는 목록과 상세 surface에 표시된다
- **THEN** 두 surface는 같은 액션 순서, 상태 의미 및 접근성 계약의 Post Action Bar를 렌더한다

#### Scenario: Repost Kind의 액션 제한

- **WHEN** Post Kind가 Repost다
- **THEN** surface는 Reply와 Repost를 렌더하되 disabled로 제공하고 Reaction·Bookmark·More는 다른 정책이 허용하는 상태를 유지한다

#### Scenario: Visibility 또는 권한상 실행 불가

- **WHEN** Post를 조회할 수 있지만 canonical Post Visibility 또는 권한 계약이 특정 액션 실행을 허용하지 않는다
- **THEN** surface는 해당 액션을 숨기지 않고 disabled 상태로 렌더한다

#### Scenario: guest의 소셜 액션 활성화

- **WHEN** 인증하지 않은 guest가 조회 가능하고 canonical 정책상 허용되는 Post의 Reply·Repost·Reaction·Bookmark를 활성화한다
- **THEN** surface는 해당 액션을 인증 여부만으로 숨기거나 비활성화하지 않고 상위 인증·가입·온보딩 진입 callback에 위임한다

#### Scenario: 중첩 입력 경계

- **WHEN** 사용자가 Action Bar의 액션을 활성화한다
- **THEN** 해당 액션 입력만 처리되고 게시글 상세 navigation이나 인접 control은 함께 활성화되지 않는다

### Requirement: 실제 액션 상태 연결

Production surface는 Reply·Repost·Reaction·Bookmark의 기존 구현 결과에서 callback과 처리 상태를 공급해야 한다(MUST). count는 선행 action 계약이 viewer-independent count를 제공하는 액션에만 optional로 공급해야 하며(MUST), count 계약이 없는 액션에 0이나 새로운 집계 값을 합성하지 않아야 한다(MUST). Repost·Bookmark 및 PROD-417·PROD-418이 selected 의미를 제공한 Reaction에만 selected를 공급해야 한다(MUST). Reply는 작성 이력이나 composer 열림을 selected로 변환하지 않아야 한다(MUST). 제공된 count와 선택된 Profile에 상대적인 selected 상태는 기존 cache 경계를 유지해야 하며(MUST), Profile 전환 시 이전 Profile의 selected 상태를 재사용하지 않아야 한다(MUST). 각 액션의 pending 상태는 해당 요청의 중복 입력만 차단해야 하며(MUST) 다른 액션을 불필요하게 차단하지 않아야 한다(MUST).

Reaction count 집계와 selected 의미는 PROD-417·PROD-418의 공개 계약을 그대로 소비해야 하며(MUST) 이 Action Bar 계약에서 별도 집계 방식이나 선택 의미를 정의하지 않아야 한다(MUST).

#### Scenario: 선택 Profile 전환

- **WHEN** 사용자가 같은 Post를 보는 동안 선택 Profile을 전환한다
- **THEN** 선행 계약이 제공한 count는 공유 가능한 값을 유지하고 selected 상태는 새 Profile에 상대적인 값으로 갱신된다

#### Scenario: 액션별 pending 경계

- **WHEN** 한 액션 요청이 pending이다
- **THEN** Action Bar는 해당 액션의 중복 입력만 차단하고 다른 활성 액션은 계속 사용할 수 있게 한다

#### Scenario: 성공한 요청 반영

- **WHEN** 연결된 action 요청이 성공한다
- **THEN** Production surface는 기존 action 계약이 제공하는 count와 selected 상태만 Action Bar에 반영한다

#### Scenario: 실패한 요청 복구

- **WHEN** 연결된 action 요청이 실패한다
- **THEN** Action Bar는 해당 액션을 error 상태로 표시하고 사용자가 같은 액션을 재시도할 수 있게 한다

### Requirement: More 링크 복사 통합

Production surface는 More callback이 활성화되면 접근 가능한 팝업을 열고(MUST) 현재 범위에서는 `링크 복사` 항목 하나를 제공해야 한다(MUST). 링크 복사는 기존 canonical route `/{relativeHandle}/{postId}`를 canonical web origin에 결합한 query·hash 없는 절대 URL을 clipboard에 복사해야 하며(MUST), Web은 현재 browser origin을, Android·iOS는 검증된 `EXPO_PUBLIC_WEB_ORIGIN`을 사용해야 한다(MUST). API origin이나 native deep link를 공유 URL로 사용하지 않아야 하며(MUST), 인증하지 않은 guest도 링크 복사를 사용할 수 있어야 한다(MUST). PostActionBar 컴포넌트는 팝업, clipboard 또는 메뉴 상태를 직접 소유하지 않아야 하며(MUST), 링크 복사 외의 More 항목은 이 change에 포함하지 않아야 한다(MUST).

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

공통 UI 구현은 Reply의 default·pending·disabled·error, selected 지원 액션의 default·selected·selected+pending·selected+disabled·selected+error·disabled·error, More callback-only, 선택적 액션, count 유무, compact count 경계 및 지원 폭을 독립적으로 검토할 수 있는 Storybook 상태 카탈로그를 제공해야 한다(MUST). 구현 자식의 component test는 표시 우선순위·입력 차단·재시도·접근성 metadata를 검증해야 하며(MUST), 계약 부모의 통합 검증은 실제 Post surface에서 Profile 전환, action별 pending, 성공·실패 복구, disabled action 유지, guest 인증 위임 및 More 링크 복사를 검증해야 한다(MUST).

#### Scenario: UI 상태 독립 검토

- **WHEN** 리뷰어가 Post Action Bar Storybook을 연다
- **THEN** production backend 없이 필수 시각 상태, 선택적 구성 및 지원 폭을 검토할 수 있다

#### Scenario: 컴포넌트 입력 검증

- **WHEN** component test가 pending·disabled·error 액션을 활성화한다
- **THEN** 차단 상태는 callback을 호출하지 않고 error 상태는 재시도 callback을 호출한다

#### Scenario: 최종 통합 검증

- **WHEN** 모든 구현 자식과 선행 action 계약이 완료된다
- **THEN** 계약 부모는 목록·상세에서 실제 상태 연결과 전체 실패 복구 흐름을 검증한다
