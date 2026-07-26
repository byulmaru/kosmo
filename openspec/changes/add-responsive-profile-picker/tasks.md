## 1. PROD-238 Web 반응형 profile picker

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `PROD-238`

**Deliverable**

Web full sidebar와 compact icon rail에서 각각 자연스러운 trigger와 surface로 profile picker를 열고, 긴 목록에서도 프로필 선택과 새 프로필 생성을 계속 사용할 수 있다.

**Guardrails**

- 기존 `compact=768`, `full=1280`, 80px icon rail과 중앙 피드 layout 폭을 유지한다.
- full Web은 inline picker, compact Web은 backdrop·focus trap 없는 비모달 overlay drawer를 사용한다.
- 프로필 목록만 internal scroll owner로 두고 추가 액션·생성 폼은 고정 footer에 유지한다.
- semantic `menu`는 profile option·separator·add action까지만 소유하고 create form·operation error alert은 같은 고정 footer 위치의 sibling으로 유지한다.
- 기존 프로필 선택·생성·실패 상태와 GraphQL·Relay actor 전환 계약을 바꾸지 않는다.
- Android/iOS와 mobile Web drawer의 picker를 재설계하지 않는다.
- PROD-213/214/215와 디자인 시스템·Figma 라이브러리 전면 정리를 포함하지 않는다.

**Verification**

- full trigger의 chevron·expanded 상태, inline picker와 같은 trigger 재실행 dismissal을 검증한다.
- compact avatar trigger, 본문 위 drawer, layout 폭 보존과 trigger 재실행·바깥 클릭·`Escape`·선택 성공 dismissal을 검증한다.
- 10개 이상 프로필에서 목록 내부 스크롤, 선택 항목 초기 focus, 방향키 이동·focus 가시성·`Escape` focus 복원과 고정 add/create footer를 검증한다.
- 선택·생성 성공과 실패 상태의 기존 interaction을 검증한다.
- Storybook browser를 768·1024·1279·1280·1440px로 직접 조절해 surface, stacking과 scroll을 시각 확인한다.
- `pnpm --filter @kosmo/app test:storybook -- Shell`, app check·Storybook build, 기존 profile-switcher E2E, scoped/all OpenSpec strict validation과 `git diff --check`를 실행한다.

**테스트 코드 범위**

- 가장 가까운 기존 Shell Storybook 영역의 typed fixture와 interaction 검증.

**테스트 필요성**

- breakpoint별 trigger/surface, 비모달 dismissal, 긴 목록 scroll과 기존 선택·생성 흐름의 핵심 회귀를 관찰 가능한 결과로 증명한다.

**테스트 제외 범위**

- 관련 없는 Storybook 상태·fixture 조합, 광범위한 snapshot, 새 test harness·인프라, GraphQL·Relay cache 테스트 확대, Android/iOS picker 테스트.

**Implementation Plan**

- `docs/superpowers/plans/2026-07-26-responsive-profile-picker.md`

**Stop Gates**

- 사용자에게 OpenSpec Gate와 별도의 최종 구현 계획 승인을 받기 전에는 제품 코드를 수정하지 않는다.
- active `add-shell-responsive-breakpoints`의 이전 popover 문구는 이 change에 흡수하거나 수정하지 않는다. 최종 active spec sync·archive 전에 적용 순서와 최신 drawer 문구를 확인한다.
- compact exact-width paint 검증에서 ancestor clipping 또는 sibling stacking 실패가 확인되면 portal/layer host로 조용히 확대하지 않고 구현을 중단해 별도 승인을 받는다.

- [ ] 1.1 닫힌 260px full profile summary를 유지하면서 picker가 summary와 navigation 사이의 flow sibling으로 높이에 참여하게 하고, 같은 이름 trigger의 expanded 상태와 위·아래 chevron을 검증한다.
- [ ] 1.2 mobile/native surface를 보존하면서 compact avatar trigger 오른쪽에 layout 폭을 바꾸지 않는 absolute overlay drawer를 표시하고, trigger 재실행·바깥 클릭·`Escape`·선택 성공 dismissal을 제공한다.
- [ ] 1.3 프로필 목록만 제한된 높이에서 스크롤하고 add/create footer를 밖에 고정하며, 선택 항목 초기 focus·방향키 이동·focus 가시성·`Escape` focus 복원을 제공한다.
- [ ] 1.4 선택·생성 failure는 picker·오류와 생성 입력을 유지하고, 명시적 close는 생성 폼·handle·오류를 초기화한다.
- [ ] 1.5 기존 Shell Storybook 영역에 10개 이상 typed profile fixture와 full·compact surface의 최소 회귀 검증을 추가하고 기존 선택·생성 interaction과 actor-flow E2E를 유지한다.
- [ ] 1.6 관련 typecheck·Storybook test/build·기존 profile-switcher E2E를 통과시키고 exact-width 시각 검증, OpenSpec scoped/all strict validation과 diff 검증 결과를 기록한다.
