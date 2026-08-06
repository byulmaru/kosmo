## Context

이 기록은 PROD-548의 앱 전역 scope, `docs/design/accessibility.md`의 공통 `IconButton` 계약, 현재 production·열린
PR inventory와 `design.md`의 구현 제약을 반영한다. 구현 전에는 각 Authority를 독립적으로 다시 확인한다.

## Decision Records

### IconButton을 Profile edit와 독립된 cross-surface change로 소유한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, `docs/design/profile-edit.md`, `PROD-548`
- Status: Active
- Context / Problem: 기존 branch는 PROD-548를 `add-local-profile-edit`에 넣고 PROD-490 archive gate와 연결했지만,
  현재 계약은 shell, post, modal, search, media, reaction, logout과 열린 PR까지 포함한다.
- Decision Outcome: 공용 component·전역 inventory·cross-surface 검증은 독립 `add-common-icon-button` change가
  소유한다. `add-local-profile-edit`는 Profile 제품 동작과 PROD-490 통합·archive만 계속 소유한다.
- Alternatives Considered: `add-local-profile-edit` 확장 — Profile과 무관한 surface의 승인·완료·archive를
  PROD-490 lifecycle에 결합하므로 선택하지 않았다. 각 surface change에 공용 계약 복제 — 하나의 target
  primitive가 여러 authority로 갈라지므로 선택하지 않았다.
- Consequences: Profile header/avatar whole-preview 적용과 기존 task coupling을 되돌리고, 각 surface OpenSpec은
  제품 동작을 유지한 채 공용 primitive의 소비자만 된다.
- Confirmation / Follow-up: `add-local-profile-edit` diff에서 PROD-548 section과 archive dependency가 제거됐는지
  strict validation과 review로 확인한다.

### Web floor는 실제 element가, Native floor는 공용 effective target 계산이 소유한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-548`
- Status: Active
- Context / Problem: caller target/style override와 Web에서 입증되지 않은 `hitSlop`만으로는 공용 floor를
  일관되게 보장할 수 없다.
- Decision Outcome: 공용 `IconButton`은 Web 32 floor와 component-specific larger target을 실제 interactive
  element에 유지한다. Native는 기존 visual·layout box를 확대하지 않고 iOS 44, Android 48에서 부족한 값을
  공용 `hitSlop`으로 보충한다. Caller target/style/`hitSlop`은 effective floor를 낮출 수 없고 Web 완료 증거는
  rendered pointer·focus target을 측정한다.
- Alternatives Considered: 각 caller가 플랫폼 target 계산 — 현재 중복 문제를 유지하므로 선택하지 않았다.
  모든 플랫폼에서 `hitSlop`만 사용 — 현재 React Native Web source와 focus bounds에서 floor를 증명하지 못하므로
  선택하지 않았다. 모든 플랫폼에서 실제 box를 확대 — Android에서 기존 44-unit layout과 visual center를
  이동시키므로 선택하지 않았다.
- Consequences: Web target enforcement는 caller visual style보다 우선하고, Native `hitSlop`은 effective region이
  줄거나 기존 expansion과 이중 적용되지 않게 정규화한다. Native focus·clipping은 source 계산만으로 완료하지 않는다.
- Confirmation / Follow-up: component test에서 Web smaller target/style override와 larger target, Native layout
  보존·부족분 계산을 검증하고 Web runtime에서 bounding box, pointer와 keyboard focus를 확인한다.

### 공용 component는 surface별 visual feedback을 강제하지 않는다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-548`
- Status: Active
- Context / Problem: 현재 action은 opacity, background, disabled state 또는 별도 feedback 없음 등 서로 다른
  시각 계약을 가진다.
- Decision Outcome: 공용 component는 target, button semantics와 state 전달을 중앙화하지만 하나의 opacity나
  background를 기본 적용하지 않는다. Visible geometry와 feedback은 기존 surface 계약을 그대로 유지한다.
- Alternatives Considered: 모든 `IconButton`에 opacity feedback 기본 적용 — 기존 시각 동작을 바꾸므로
  선택하지 않았다. Feedback variant를 모든 caller에 강제 — 필요 없는 공용 API와 migration 변환을 늘리므로
  선택하지 않았다.
- Consequences: pressed state를 받는 style/content seam은 유지하되 각 caller가 기존 feedback을 명시한다.
- Confirmation / Follow-up: surface 회귀 테스트와 Storybook/Web runtime에서 pressed·disabled 시각 결과를
  전환 전 geometry와 비교한다.

### 함수형 outer style은 안정적인 target 또는 visual size를 요구한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-548`, 2026-08-06 사용자 승인
- Status: Active
- Context / Problem: 정적 square style은 width·height를 flatten해 Native layout 크기를 추론할 수 있지만,
  press state를 받는 함수형 style은 실행 전 안정적인 크기를 알 수 없다. Size prop이 없으면 iOS 44·Android 48
  default min size가 caller의 40×40 style 뒤에 적용되어 기존 layout box를 확대할 수 있다.
- Decision Outcome: 함수형 outer `style`은 `targetSize` 또는 `visualSize` 중 하나를 public type에서 필수로
  제공한다. 정적 square style 추론과 함수형 `visualStyle`·children의 press-state 전달은 유지한다.
- Alternatives Considered: 별도 `layoutSize` prop 추가 — `targetSize`·`visualSize`와 중복되는 public API를
  늘리므로 선택하지 않았다. Function style callback을 기본 state로 미리 실행해 크기 추론 — pressed state에 따라
  layout이 달라질 수 있고 callback 실행 시점을 추가하므로 선택하지 않았다.
- Consequences: 현재 production의 유일한 함수형 outer style caller는 이미 `targetSize`를 제공해 시각 변경이 없다.
  새 caller의 누락은 TypeScript에서 차단하며 cast·비TypeScript 호출은 보장 범위 밖이다.
- Confirmation / Follow-up: type-test에서 함수형 style의 size 누락을 거부하고 `targetSize`·`visualSize` 허용을
  확인한다. Component test에서 명시적 40 layout이 iOS 2pt·Android 4dp `hitSlop`을 유지하는지 검증한다.

### 열린 PR은 merge 순서에 따라 동적으로 전환을 소유한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-548`
- Status: Active
- Context / Problem: PR #486과 #510이 공통 component와 병렬로 진행 중이며 고정 stack은 기존 review와 merge
  순서를 불필요하게 바꾼다.
- Decision Outcome: 대상 action이 먼저 production에 들어오면 PROD-548가 rebase 후 흡수한다. 공용 component
  merge 뒤에도 PR이 열려 있으면 해당 PR이 최신 production을 반영하고 자신의 action을 merge 전에 전환한다.
- Alternatives Considered: 모든 관련 PR을 PROD-548 위에 stack — base와 review 순서를 바꾸므로 선택하지 않았다.
  관련 PR이 모두 merge될 때까지 PROD-548 대기 — 공용화가 늦어지고 새 중복이 늘 수 있어 선택하지 않았다.
- Consequences: #516은 공용 component와 현재 production을 우선 전달하며, 미병합 소비자 branch의 전환은 각
  PR이 소유할 수 있다. Change archive owner는 마지막 남은 전환·검증 증거를 가진 실제 구현 PR로 결정한다.
- Confirmation / Follow-up: 각 merge readiness 시점에 GitHub state와 production/open PR inventory를 다시 읽고
  전환 owner와 남은 task를 PR 본문에 기록한다.
- Current Outcome (2026-08-05): PR #486이 먼저 merge되어 FeedbackOverlay close를 PROD-548 production branch가
  흡수한다. PR #510의 close·previous·next는 아직 열린 consumer branch가 소유한다.

### Native source mapping과 runtime 완료를 분리한다

- Decision Date: 2026-08-05
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/accessibility.md`, `PROD-548`
- Status: Active
- Context / Problem: 공용 React Native source는 iOS·Android floor를 표현할 수 있지만 현재 scope는 Native
  실제 기기·simulator QA를 포함하지 않는다.
- Decision Outcome: iOS 44와 Android 48 mapping 및 자동화는 이 change에서 유지한다. Web 또는 source-level
  증거를 Native touch·focus·VoiceOver·TalkBack 완료로 표현하지 않는다.
- Alternatives Considered: Native runtime을 PROD-548 완료 조건에 포함 — 현재 Linear 제외 범위를 넓히므로
  선택하지 않았다. Native mapping 제거 — 공용 universal component 계약을 깨므로 선택하지 않았다.
- Consequences: Native parent clipping, focus bounds와 assistive technology 결과는 출시 gate의 명시적 검증
  공백으로 남는다.
- Confirmation / Follow-up: PR과 OpenSpec 완료 보고에 실행한 Web 검증, source mapping과 미실행 Native QA를
  분리해 기록한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
