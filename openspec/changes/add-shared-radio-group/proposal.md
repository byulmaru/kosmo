## Why

FeedbackForm, ProfileDefaultPostVisibilityControl, SelectMenu가 radio option의 semantics, 선택 상태와 Web keyboard 동작을 서로 다르게 구현한다. PROD-753에서 승인한 공용 계약으로 세 소비처를 수렴해 접근성과 상태 표현을 일관되게 유지한다.

## What Changes

- controlled `RadioGroup`·`RadioOption`이 group/option semantics, checked·disabled 상태, label·description, focus 표시를 제공한다.
- Web에서 선택된 option만 tab stop이 되는 roving tabIndex와 방향키 순환 선택·focus 이동을 제공한다.
- Feedback 종류, 기본 게시 공개 범위와 SelectMenu option 선택을 공용 primitive로 이관한다.
- Feedback mutation·dirty/submitting, 공개 범위 저장·Relay actor, SelectMenu modal lifecycle과 각 option layout은 기존 소비처에 유지한다.
- Storybook에서 selected, disabled, long label과 Web·Native 렌더링 상태를 검증한다.

## Authority / Provenance

- Canonical: `docs/design/foundations.md`, `docs/design/accessibility.md`, `docs/design/feedback.md`
- Linear Contract: PROD-753
- Linear Implementations: PROD-753

## Capabilities

### New Capabilities

- `radio-group`: 공용 controlled radio group/option semantics, 상태, Web keyboard 계약과 소비처 생명주기 경계를 정의한다.

### Modified Capabilities

없음.

## Impact

- `apps/app/src/components/ui`의 공용 primitive
- FeedbackForm, ProfileDefaultPostVisibilityControl, SelectMenu 소비처
- 관련 Storybook 및 최소 keyboard/semantics 회귀 테스트
- GraphQL schema, mutation, Relay 데이터 계약과 새 dependency 변경 없음
