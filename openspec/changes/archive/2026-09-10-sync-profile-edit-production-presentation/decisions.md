## Context

이 기록은 DSN-45의 완료된 Figma source, PROD-941의 기존 필드·화면 배치 이관 범위, PROD-531의 Follow Approval 이전 책임과 현재 `docs/design/profile-edit.md`의 Production 경계를 독립 대조해 정리한다.

## Decision Records

### 기존 Profile Edit 필드만 시각 계약을 이관한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, DSN-45, PROD-941, PROD-531
- Status: Active
- Context / Problem: DSN-45에는 현재 Production 필드의 시각 계약과 아직 제품 계약이 완료되지 않은 Profile 추가 정보·이미지 편집 Candidate가 함께 존재하며, Figma에서는 Follow Approval이 제거됐지만 Settings 이전은 완료되지 않았다.
- Decision Outcome: PROD-941은 현재 Production의 displayName, bio, Profile Tags, avatar/header와 화면 chrome만 DSN-45에 맞춘다. Follow Approval Switch는 PROD-531이 Settings 이전과 중복 저장 제거를 완료할 때까지 기존 Profile draft에 유지하며 Profile 추가 정보와 crop·alt text를 추가하지 않는다.
- Alternatives Considered: DSN-45 전체 Candidate 도입은 PROD-514·PROD-794의 미완료 제품 계약을 선행하므로 제외한다. Figma와 맞추기 위해 Follow Approval만 먼저 제거하는 방식은 현재 저장 소유권을 끊으므로 제외한다.
- Consequences: 화면의 필드 순서는 당분간 Figma consumer와 완전히 같지 않지만 실제 Production capability와 저장 계약은 유지된다.
- Confirmation / Follow-up: Storybook과 Production route에서 기존 field와 Follow Approval draft/save를 회귀 검증하고, Settings 이전은 PROD-531에서 별도로 완료한다.

### Profile Edit 전용 composition과 공용 primitive의 책임을 유지한다

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/foundations.md`, `docs/design/page-header.md`, PROD-941
- Status: Active
- Context / Problem: `PageHeader`, `ProfileHero`, `TextField`와 `Avatar`가 일부 시각 요소를 이미 제공하지만 각 컴포넌트의 데이터·배치·접근성 책임은 Profile Edit와 동일하지 않다.
- Decision Outcome: `ProfileEditScreen`, `ProfileEditForm`, `ProfileEditImageFields`와 `ProfileTagEditor`를 유지하고 기존 `Button`, `IconButton`, `ActionMenu`, `TextField`·`TextArea`와 role token을 해당 전용 composition 안에서 재사용한다. avatar는 removed/empty semantics를 보존하기 위해 공용 `Avatar`가 아닌 기존 raw `Image`/placeholder를 유지하며, single button·접근성 subtree·content geometry는 보존한다. `PageHeader`나 `ProfileHero`로 화면 부분을 통째로 교체하지 않는다.
- Alternatives Considered: `PageHeader` 교체는 title flow와 exact-height 계약을 바꾸고, `ProfileHero` 교체는 Relay와 공개 Profile 동작을 편집 화면에 결합한다. 공용 TextField label 전역 변경은 다른 form consumer까지 변경하므로 제외한다.
- Consequences: 작은 Profile Edit 전용 layout 코드는 남지만 route·Relay·Media lifecycle과 공용 component API는 확장하지 않는다.
- Confirmation / Follow-up: 실제 render tree에서 중첩 focus target이 없고 기존 route callback·state가 그대로 전달되는지 확인한다.

### 시각 geometry와 platform 입력 target을 분리한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/profile-edit.md`, `docs/design/icons.md`, `docs/design/accessibility.md`, DSN-45, PROD-941
- Status: Active
- Context / Problem: DSN-45의 `44×44` back target과 `40px` 저장·camera visual을 그대로 Android layout 최소값으로 사용하면 `48dp` 접근성 target을 충족하지 못할 수 있다.
- Decision Outcome: Profile Edit는 Figma의 `64px` header, `44×44` back layout target, `24px` ArrowLeft, Web `64×40` 저장 visual과 `40×40` camera affordance를 유지한다. Android/iOS에서는 기존 공용 control의 hit slop·minimum size로 각각 `48dp`, `44pt` 실제 입력 target을 제공한다.
- Alternatives Considered: 모든 플랫폼의 시각 box를 `48`로 키우는 방식은 승인된 Figma geometry를 바꾸고, Android 최소 target을 생략하는 방식은 접근성 계약을 위반하므로 제외한다.
- Consequences: platform별 실제 layout 또는 hit 영역은 Web screenshot과 다를 수 있으며 시각 크기와 접근성 target을 별도로 검증해야 한다.
- Confirmation / Follow-up: Web geometry assertion과 공용 control의 platform test를 실행하고 실제 Native runtime 미실행 여부를 완료 기록에서 분리한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
