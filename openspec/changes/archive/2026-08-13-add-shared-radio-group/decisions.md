## Context

이 기록은 PROD-753, 승인된 `docs/design/foundations.md` 소유권 경계, 전역 접근성 계약과 현재 두 소비처 구현을 반영한다. 후속 PROD-775가 canonical option presentation 소유권을 변경한 기록도 함께 보존한다.

## Decision Records

### 공용 primitive는 radio 계약을, consumer는 제품 lifecycle을 소유한다

- Decision Date: 2026-08-12
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/foundations.md`, `docs/design/feedback.md`, PROD-753
- Status: Active
- Context / Problem: 두 소비처가 radio semantics와 keyboard를 중복 구현하지만 mutation과 Relay lifecycle은 서로 다르다.
- Decision Outcome: `RadioGroup`·`RadioOption`은 controlled value/change, group/option semantics, checked·disabled state와 Web keyboard 이동을 소유한다. `RadioOption` presentation 소유권은 아래 PROD-775 decision을 따르고, Feedback validation·dirty/submitting·mutation과 공개 범위 저장·Relay actor lifecycle은 consumer에 남긴다.
- Alternatives Considered: primitive가 저장·닫기까지 수행하는 통합 control은 기존 lifecycle 소유권을 침범하므로 제외한다. 각 consumer에 keyboard helper만 복제하는 안은 공용 primitive 요구를 충족하지 않아 제외한다.
- Consequences: consumer callback이 제품 동작을 계속 결정하며 primitive는 GraphQL·Relay·modal API를 알지 않는다.
- Confirmation / Follow-up: 두 consumer의 기존 validation·saving 검증과 공용 component semantics test를 대조한다.

### Web은 roving tabIndex와 네 방향키 이동을 사용한다

- Decision Date: 2026-08-12
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, PROD-753
- Status: Active
- Context / Problem: FeedbackForm에만 방향키 이동이 있고 나머지 consumer는 keyboard 계약이 없다.
- Decision Outcome: Web에서는 현재 선택된 enabled option만 tab stop으로 두고 ArrowUp·ArrowLeft는 이전, ArrowDown·ArrowRight는 다음 enabled option으로 순환하며 focus와 change 요청을 함께 이동한다. 방향키는 disabled option을 건너뛴다. 현재 값에 해당하는 enabled option이 없으면 첫 enabled option이 tab stop이고, 모두 disabled면 tab stop이 없다. Web focus presentation은 아래 PROD-775 decision을 따르며 별도 input-modality helper를 만들지 않는다. Native에는 Web key handler를 적용하지 않고 radio role/state를 제공한다.
- Alternatives Considered: 모든 option을 Tab 순서에 두는 안, Home·End 단축키 확장과 별도 keyboard/pointer modality state는 승인된 범위보다 넓으므로 제외한다. PostComposer의 `menuitemradio` helper 재사용은 semantics가 달라 제외한다.
- Consequences: checked state와 fallback tab stop은 분리될 수 있다. disabled option은 keyboard 이동에서 제외되며 Web runtime과 Native assistive technology 증거를 별도로 보고해야 한다.
- Confirmation / Follow-up: component test에서 tabIndex fallback·네 방향키·disabled skip을 확인하고 실제 Web Storybook에서 `:focus-visible` focus 이동을 확인한다.

### Option geometry와 제품 시각 위계는 consumer가 소유한다

- Decision Date: 2026-08-12
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/foundations.md`, `docs/design/accessibility.md`, `docs/design/feedback.md`, PROD-753
- Status: Superseded by `RadioOption은 canonical option presentation과 state visual을 소유한다` (2026-08-27, PROD-775)
- Context / Problem: Feedback과 profile visibility의 indicator, spacing과 border가 서로 다르다.
- Decision Outcome: RadioOption은 label·optional description과 상태 표현을 제공하되 하나의 고정 높이·padding·indicator geometry를 강제하지 않는다. Web focus indicator는 플랫폼 `:focus-visible`을 숨기지 않고 별도 focus style을 추가하지 않으며 consumer content/style을 허용한다.
- Alternatives Considered: 두 consumer를 하나의 card/list-row 디자인으로 통일하는 안은 명시된 layout 제외 범위를 위반하므로 제외한다.
- Consequences: semantics와 keyboard는 공용화되지만 consumer별 시각 style 일부는 의도적으로 남는다.
- Confirmation / Follow-up: Storybook에서 selected·disabled·long label을 Web과 Native renderer로 확인하고 기존 consumer geometry를 시각 검토한다.

### RadioOption은 canonical option presentation과 state visual을 소유한다

- Decision Date: 2026-08-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/foundations.md`, `docs/design/accessibility.md`, `docs/design/feedback.md`, DSN-39, PROD-775
- Status: Active
- Context / Problem: DSN-39의 공용 Figma source를 PROD-775에서 반영하면서, PROD-753이 consumer에 남겼던 option geometry와 state visual을 계속 분산 소유하면 공용 source와 consumer가 다시 달라진다.
- Decision Outcome: `RadioOption`은 20px indicator와 10px inner dot, 12px corner radius·content gap·outer inset, label·description typography, selected indicator와 hover·pressed·disabled·focus visual을 소유한다. Selected row에는 별도 fill을 두지 않는다. Web keyboard focus는 `:focus-visible`을 사용해 semantic focus token의 내부 2px border로 표시하고 inset을 보정해 outer geometry를 유지하며, 이 indicator가 browser outline을 대체한다. Consumer는 group placement와 제품 validation·mutation·Relay lifecycle을 계속 소유한다.
- Alternatives Considered: consumer가 option presentation을 계속 소유하는 안은 공용 Figma source와 구현의 단일 소유권을 깨뜨려 제외한다. 고정 높이는 긴 label과 description reflow를 막으므로 제외한다. 별도 input-modality helper는 `:focus-visible`로 충분해 추가하지 않는다.
- Consequences: 이관 consumer는 같은 option presentation과 state visual을 자동으로 상속하고, 여러 줄 content는 canonical inset을 유지한 채 높이가 늘어난다. 제품 로직과 group 배치는 바뀌지 않는다.
- Confirmation / Follow-up: component test와 Storybook에서 geometry·selected·hover·pressed·disabled·focus·long content를 검증한다. 실제 Android·iOS runtime QA는 PROD-846에서 수행한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `Option geometry와 제품 시각 위계는 consumer가 소유한다` (2026-08-12): PROD-775에서 canonical option presentation과 state visual을 공용 `RadioOption`으로 이전해 대체했다.
