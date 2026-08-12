## Context

세 소비처는 모두 React Native `Pressable`로 radio state를 표현하지만 keyboard 계약은 FeedbackForm에만 있다. FeedbackForm은 별도 ref 배열과 roving tabIndex를 소유하고, ProfileDefaultPostVisibilityControl과 SelectMenu는 checked semantics만 제공한다. 각 소비처의 mutation·dirty state·Relay environment·modal lifecycle과 visual geometry는 이미 서로 다른 책임을 가진다.

## Goals / Non-Goals

**Goals:**

- 공용 controlled radio semantics와 Web keyboard 이동을 한 primitive로 제공한다.
- Web과 Native에서 같은 checked·disabled·label·description 계약을 사용한다.
- 세 소비처가 기존 validation·saving·modal lifecycle과 layout을 유지한 채 primitive를 사용한다.
- 기존 theme focus·selected·disabled 표현을 재사용한다.

**Non-Goals:**

- Feedback mutation, 공개 범위 mutation·Relay state 또는 SelectMenu modal lifecycle 변경
- PostComposer의 `menuitemradio` 메뉴 계약 통합
- option geometry나 모든 소비처의 시각 디자인 통일
- 새 dependency, GraphQL schema 또는 데이터 migration

## Implementation Guidance

### Current Constraints

- FeedbackForm의 option renderer는 종류 선택뿐 아니라 dirty/submitting 보고와 제출 상태 초기화를 호출하므로 이 consumer callback을 primitive 내부로 옮길 수 없다.
- ProfileDefaultPostVisibilityControl은 저장 전 로컬 선택과 저장된 값을 분리하고 Relay environment 교체·늦은 응답을 격리하므로 선택 primitive가 저장 mutation을 실행하면 안 된다.
- SelectMenu는 option 선택 후 modal을 닫지만 open/close와 focus lifecycle은 ModalSheet가 소유한다.
- 세 소비처의 option 구조와 spacing이 달라 공용 component가 고정 container·indicator geometry를 강제하면 기존 layout과 긴 label을 깨뜨린다.
- 현재 focus 표현은 Button·TextField·FeedbackForm에서 theme focus token과 focused state를 사용한다. 별도 input-modality helper나 radio dependency는 없으며 이번 범위에서도 추가하지 않는다.

### Recommended Approach

작은 compound primitive를 `apps/app/src/components/ui`에 둔다. `RadioGroup`은 group name, controlled value/change callback, ordered enabled option과 ref를 공유하고 Web roving tabIndex·방향키 순환 이동을 처리한다. 현재 값에 해당하는 enabled option이 없으면 첫 enabled option만 tab stop으로 두고 모두 disabled면 tab stop을 두지 않는다. `RadioOption`은 React Native `Pressable`을 사용해 radio role, checked·disabled state, focus 표시와 consumer가 전달한 content/style을 결합한다. Web focus ring은 브라우저 `:focus-visible` 상태를 사용하고 별도 modality helper를 두지 않는다.

FeedbackForm에서는 기존 group wrapper, ref와 key handler만 제거하고 `selectKind`를 controlled callback으로 유지한다. ProfileDefaultPostVisibilityControl은 로컬 `selectedVisibility`와 save action을 그대로 두고 option renderer만 이관한다. SelectMenu는 ModalSheet와 선택 후 close callback을 유지하고 option 목록만 공용 group으로 감싼다.

공용 Storybook story는 selected, disabled, description, long label을 포함하고 Web·Native renderer에서 확인 가능하게 한다. 가장 가까운 단일 component test에서 role/state, disabled activation과 Web 방향키 이동을 관찰 가능한 결과로 검증한다. 기존 consumer 검증은 lifecycle이 유지되는지 확인하는 범위만 실행한다.

### Allowed Alternatives

spec과 Active decision을 지키는 한 option 순서·ref를 React context 등록 대신 명시적인 ordered data나 children 분석으로 관리할 수 있다. 새 dependency 없이 소비처 callback과 layout 소유권을 유지해야 한다.

### Known Traps

- PostComposer의 `menuitemradio` keyboard helper를 재사용해 menu와 radio group semantics를 합치지 않는다.
- primitive가 Feedback submit, visibility save 또는 SelectMenu close를 직접 실행하지 않는다.
- disabled option을 tab stop이나 방향키 대상으로 남기지 않는다.
- Storybook 정적 a11y 결과를 실제 Web keyboard 또는 Native assistive technology 검증으로 일반화하지 않는다.

## Risks / Trade-offs

- [Controlled callback 뒤 consumer가 값을 갱신하지 않으면 focus와 checked state가 잠시 다를 수 있음] → checked state는 항상 value prop을 따르고 focus 이동만 input event에서 수행한다.
- [공용 focus style이 기존 option visual과 충돌할 수 있음] → 브라우저 `:focus-visible` 상태에서 theme focus token만 적용하고 geometry·selected surface는 consumer style을 허용한다.
- [Native runtime 증거 부족] → Storybook 렌더와 정적 semantics를 기록하되 실제 iOS·Android assistive technology 미실행 여부를 별도로 보고한다.

## Migration Plan

1. 공용 primitive, component test와 Storybook states를 추가한다.
2. FeedbackForm의 기존 keyboard/ref 구현을 공용 primitive로 대체한다.
3. ProfileDefaultPostVisibilityControl과 SelectMenu option renderer를 이관한다.
4. 관련 unit test, Storybook, typecheck와 Web keyboard 수동 검증을 수행한다.
5. 회귀 시 소비처별 사용을 기존 raw Pressable 구현으로 되돌릴 수 있으며 데이터 migration이나 rollback 작업은 없다.

## Open Questions

없음.
