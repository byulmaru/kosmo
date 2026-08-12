## 1. PROD-753 공용 RadioGroup과 소비처 이관

**Authority / Provenance**

- `docs/design/foundations.md`
- `docs/design/accessibility.md`
- `docs/design/feedback.md`
- PROD-753

**Deliverable**

FeedbackForm, ProfileDefaultPostVisibilityControl과 SelectMenu가 Web·Native에서 동일한 controlled radio semantics를 사용하고, Web에서 roving tabIndex와 네 방향키 순환 이동을 제공한다.

**Guardrails**

- Feedback validation·dirty/submitting·mutation lifecycle을 변경하지 않는다.
- 공개 범위 저장 mutation과 Relay actor·environment lifecycle을 변경하지 않는다.
- SelectMenu modal open·close lifecycle을 변경하지 않는다.
- option에 고정 geometry를 강제하지 않고 label·description과 consumer별 layout을 보존한다.
- PostComposer의 `menuitemradio` 계약과 합치거나 새 dependency를 추가하지 않는다.

**Verification**

- 가장 가까운 공용 component test에서 group/option role·name·checked·disabled, disabled activation 차단, Web roving tabIndex fallback과 네 방향키 순환·disabled skip을 검증한다.
- Storybook에서 selected, disabled, description과 long label을 Web·Native renderer로 확인한다.
- 기존 Feedback validation/submission, profile visibility selection/save와 SelectMenu 선택 후 close 동작에 적용되는 관련 test·Storybook을 실행한다.
- 실제 Web에서 Tab 진입, 방향키 focus·selection과 `:focus-visible` indicator를 확인하고, 실행하지 않은 Native assistive technology 검증은 별도로 기록한다.

- [x] 1.1 Controlled group/option semantics, checked·disabled·focus와 Web keyboard 계약을 제공한다.
- [x] 1.2 공용 primitive의 핵심 semantics·keyboard 회귀 test와 selected·disabled·long-label Storybook states를 추가한다.
- [ ] 1.3 Feedback 종류 선택을 이관하고 기존 validation·dirty/submitting·mutation 동작을 유지한다.
- [ ] 1.4 기본 게시 공개 범위 선택을 이관하고 기존 저장·Relay lifecycle을 유지한다.
- [ ] 1.5 SelectMenu option 선택을 이관하고 기존 modal open·close와 consumer layout을 유지한다.
- [ ] 1.6 관련 자동화, Web keyboard·focus 수동 검증과 OpenSpec strict validation을 완료하고 플랫폼별 미검증 범위를 기록한다.
