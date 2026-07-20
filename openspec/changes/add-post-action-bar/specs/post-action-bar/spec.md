## ADDED Requirements

### Requirement: 고정된 액션 구성

Post Action Bar는 표시하도록 제공된 액션을 Reply → Repost → Reaction → Bookmark → More 순서의 단일 행으로 렌더해야 한다(MUST). 액션별 설정이 제공되지 않으면 해당 위치를 렌더하지 않아야 하며(MUST), 남은 액션의 상대 순서는 바꾸지 않아야 한다(MUST). More는 icon-only 액션이어야 하며(MUST) count나 메뉴 동작을 자체적으로 제공하지 않아야 한다(MUST).

#### Scenario: 모든 액션 표시

- **WHEN** 다섯 액션의 설정이 모두 제공된다
- **THEN** Action Bar는 Reply, Repost, Reaction, Bookmark, More 순서로 렌더한다

#### Scenario: 선택적 액션 생략

- **WHEN** Post 정책에 따라 일부 액션의 설정이 제공되지 않는다
- **THEN** Action Bar는 해당 액션을 숨기고 제공된 액션의 상대 순서를 유지한다

#### Scenario: More 표시

- **WHEN** More 설정과 callback이 제공된다
- **THEN** Action Bar는 접근 가능한 icon-only More 버튼을 표시하고 메뉴나 링크 복사 동작은 실행하지 않는다

### Requirement: 액션의 시각 상태

각 액션은 선택 여부와 처리 상태를 독립적으로 받아야 한다(MUST). default 상태는 보조 텍스트 색상의 icon과 선택적 count를 표시해야 하고(MUST), selected 상태는 primary 색상의 icon으로 선택을 표현해야 한다(MUST). pending 상태는 icon 자리에 spinner를 표시하고(MUST), disabled 상태는 icon과 count를 비활성 표현으로 약화해야 하며(MUST), error 상태는 icon과 count를 danger 색상으로 표시해야 한다(MUST). pending 중에도 selected 의미를 잃지 않아야 한다(MUST).

#### Scenario: 선택된 액션

- **WHEN** 액션이 selected이고 처리 상태가 default다
- **THEN** Action Bar는 해당 icon을 primary 색상으로 표시하고 선택 상태를 노출한다

#### Scenario: 선택된 액션의 처리 중 상태

- **WHEN** selected 액션의 처리 상태가 pending으로 바뀐다
- **THEN** Action Bar는 icon 자리에 spinner를 표시하면서 접근성 selected 상태를 유지한다

#### Scenario: 비활성 상태

- **WHEN** 액션의 처리 상태가 disabled다
- **THEN** Action Bar는 icon과 count를 비활성 표현으로 표시한다

#### Scenario: 실패 상태

- **WHEN** 액션의 마지막 요청이 실패해 처리 상태가 error다
- **THEN** Action Bar는 icon과 count를 danger 색상으로 표시하고 재시도 가능한 상태임을 나타낸다

### Requirement: 액션 입력 계약

Action Bar는 각 표시 액션의 callback을 외부에서 받아야 하며(MUST) 자체적으로 navigation, menu, mutation 또는 cache 갱신을 수행하지 않아야 한다(MUST). default·selected·error 상태의 액션은 사용자 입력 시 callback을 한 번 호출해야 한다(MUST). pending·disabled 상태는 touch, pointer 및 keyboard 입력을 차단하고 callback을 호출하지 않아야 한다(MUST).

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

### Requirement: 액션 접근성

표시되는 각 액션은 button role과 액션별 label을 노출해야 하며(MUST) 시각 icon이나 count에만 의미를 의존하지 않아야 한다(MUST). 액션은 시각 크기와 별도로 최소 44×44 interactive target을 가져야 한다(MUST). selected·pending·disabled 상태는 플랫폼에서 지원하는 접근성 state로 노출해야 하며(MUST), error 상태는 label 또는 hint로 재시도 의도를 전달해야 한다(MUST).

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

### Requirement: 반응형 배치

Action Bar는 compact·mobile·web의 지원 폭에서 액션을 한 행에 배치해야 하고(MUST) 줄바꿈이나 순서 변경 없이 사용 가능한 가로 공간에 분배해야 한다(MUST). 긴 count 또는 count가 없는 액션이 있어도 각 액션의 icon, count 및 interactive target이 겹치지 않아야 한다(MUST).

#### Scenario: compact 폭

- **WHEN** Action Bar가 compact 게시글 콘텐츠 폭에 렌더된다
- **THEN** 표시 액션은 한 행과 고정 순서를 유지하며 최소 interactive target을 충족한다

#### Scenario: web 폭

- **WHEN** Action Bar가 넓은 Web 게시글 콘텐츠 폭에 렌더된다
- **THEN** 표시 액션은 늘어난 공간에 분배되지만 순서와 시각 계층은 compact 표현과 동일하다

#### Scenario: 긴 count

- **WHEN** 하나 이상의 액션에 긴 count가 제공된다
- **THEN** Action Bar는 다른 액션과 겹치거나 행을 분리하지 않고 count를 표시한다

### Requirement: Production Post surface 배치

지원되는 Home Post List, Profile Post List 및 Post 상세 surface의 게시글은 공통 Post Action Bar 계약을 사용해야 한다(MUST). surface는 기존 Post Kind별 정책이 허용하는 액션 설정만 제공해야 하며(MUST), Action Bar가 정책을 자체 판단하게 하지 않아야 한다(MUST). surface 배치는 게시글의 기존 상세 navigation 및 다른 interactive control의 입력을 가로채지 않아야 한다(MUST).

#### Scenario: 목록과 상세의 공통 계약

- **WHEN** 같은 Post가 지원되는 목록과 상세 surface에 표시된다
- **THEN** 두 surface는 같은 액션 순서, 상태 의미 및 접근성 계약의 Post Action Bar를 렌더한다

#### Scenario: Post Kind별 액션 제한

- **WHEN** 기존 Post Kind 정책이 특정 액션을 허용하지 않는다
- **THEN** surface는 해당 액션 설정을 제공하지 않고 Action Bar는 그 액션을 렌더하지 않는다

#### Scenario: 중첩 입력 경계

- **WHEN** 사용자가 Action Bar의 액션을 활성화한다
- **THEN** 해당 액션 입력만 처리되고 게시글 상세 navigation이나 인접 control은 함께 활성화되지 않는다

### Requirement: 실제 액션 상태 연결

Production surface는 Reply·Repost·Reaction·Bookmark의 기존 구현 결과에서 count, selected 및 처리 상태를 공급해야 한다(MUST). viewer-independent count와 선택된 Profile에 상대적인 selected 상태는 기존 cache 경계를 유지해야 하며(MUST), Profile 전환 시 이전 Profile의 selected 상태를 재사용하지 않아야 한다(MUST). 각 액션의 pending 상태는 해당 요청의 중복 입력만 차단해야 하며(MUST) 다른 액션을 불필요하게 차단하지 않아야 한다(MUST).

#### Scenario: 선택 Profile 전환

- **WHEN** 사용자가 같은 Post를 보는 동안 선택 Profile을 전환한다
- **THEN** count는 공유 가능한 값을 유지하고 selected 상태는 새 Profile에 상대적인 값으로 갱신된다

#### Scenario: 액션별 pending 경계

- **WHEN** 한 액션 요청이 pending이다
- **THEN** Action Bar는 해당 액션의 중복 입력만 차단하고 다른 활성 액션은 계속 사용할 수 있게 한다

#### Scenario: 성공한 요청 반영

- **WHEN** 연결된 action 요청이 성공한다
- **THEN** Production surface는 기존 action 계약의 결과를 Action Bar의 count와 selected 상태에 반영한다

#### Scenario: 실패한 요청 복구

- **WHEN** 연결된 action 요청이 실패한다
- **THEN** Action Bar는 해당 액션을 error 상태로 표시하고 사용자가 같은 액션을 재시도할 수 있게 한다

### Requirement: 상태 카탈로그와 통합 검증

공통 UI 구현은 default·selected·selected+pending·disabled·error, 선택적 액션, count 유무, 긴 count 및 지원 폭을 독립적으로 검토할 수 있는 Storybook 상태 카탈로그를 제공해야 한다(MUST). 구현 자식의 component test는 표시·입력 차단·재시도·접근성 metadata를 검증해야 하며(MUST), 계약 부모의 통합 검증은 실제 Post surface에서 Profile 전환, action별 pending, 성공·실패 복구 및 Post Kind별 노출을 검증해야 한다(MUST).

#### Scenario: UI 상태 독립 검토

- **WHEN** 리뷰어가 Post Action Bar Storybook을 연다
- **THEN** production backend 없이 필수 시각 상태, 선택적 구성 및 지원 폭을 검토할 수 있다

#### Scenario: 컴포넌트 입력 검증

- **WHEN** component test가 pending·disabled·error 액션을 활성화한다
- **THEN** 차단 상태는 callback을 호출하지 않고 error 상태는 재시도 callback을 호출한다

#### Scenario: 최종 통합 검증

- **WHEN** 모든 구현 자식과 선행 action 계약이 완료된다
- **THEN** 계약 부모는 목록·상세에서 실제 상태 연결과 전체 실패 복구 흐름을 검증한다
