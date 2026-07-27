## 1. PROD-238 Web 반응형 profile picker

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/figma.md`
- `PROD-238`

**Deliverable**

Web full sidebar와 compact icon rail에서 각각 자연스러운 trigger와 surface로 profile picker를 열고, 긴 목록에서도 프로필 선택과 새 프로필 생성을 계속 사용할 수 있다.

**Guardrails**

- 기존 `compact=768`, `full=1280`, 80px icon rail과 중앙 피드 layout 폭을 유지한다.
- full Web은 닫힌 260px summary를 유지하면서 프로필 이름 trigger 바로 아래에 비모달 overlay picker를 표시하고,
  compact Web은 backdrop·focus trap 없는 비모달 overlay drawer를 사용하며 두 surface 모두 기존 layout 폭을
  바꾸지 않는다.
- 프로필 목록만 internal scroll owner로 두고 추가 액션·생성 폼은 고정 footer에 유지한다.
- full·compact Web picker는 기존 viewport 여백 계산을 유지하면서 최대 높이를 430px로 제한한다.
- semantic `menu`는 profile option·separator·add action까지만 소유하고 create form·operation error alert은 같은 고정 footer 위치의 sibling으로 유지한다.
- 기존 프로필 선택·생성·실패 상태와 GraphQL·Relay actor 전환 계약을 바꾸지 않는다.
- mobile Web drawer는 이름·chevron 내부 content의 2px 광학 보정과 Web 전용 open chevron만 변경한다. trigger
  hitbox·picker anchor·navigation geometry, drawer content·close lifecycle과 Android/iOS picker는 재설계하지 않는다.
- PROD-213/214/215와 디자인 시스템·Figma 라이브러리 전면 정리를 포함하지 않는다.

**Verification**

- full trigger의 chevron·expanded 상태, overlay picker, navigation 위치 불변과 같은 trigger 재실행·바깥
  클릭·`Escape`·선택 성공 dismissal을 검증한다.
- compact avatar trigger, 본문 위 drawer, layout 폭 보존과 trigger 재실행·바깥 클릭·`Escape`·선택 성공 dismissal을 검증한다.
- 10개 이상 프로필에서 목록 내부 스크롤, 선택 항목 초기 focus, 방향키 이동·focus 가시성·`Escape` focus 복원과 고정 add/create footer를 검증한다.
- 선택·생성 성공과 실패 상태의 기존 interaction을 검증한다.
- Storybook browser를 768·1024·1279·1280·1440px로 직접 조절해 surface, stacking과 scroll을 시각 확인한다.
- mobile Storybook에서 drawer trigger의 닫힘/열림 chevron, 2px 광학 보정과 navigation 위치 불변을 확인한다.
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
- full·compact exact-width paint 검증에서 ancestor clipping 또는 sibling stacking 실패가 확인되면
  portal/layer host로 조용히 확대하지 않고 구현을 중단해 별도 승인을 받는다.

- [x] 1.1 navigation 밀림 교정 checkpoint에서 닫힌 260px full profile summary를 유지하면서 picker를 summary
      아래의 anchored absolute overlay로 표시하고 navigation 위치와 sidebar·중앙 피드 폭을 유지하며, 같은 이름
      trigger의 expanded 상태·위아래
      chevron과 같은 trigger·바깥 pointer close·`Escape`·선택 성공 dismissal, 바깥 pointer 대상의 기본 focus와
      transient reset을 검증한다. 세로 앵커는 1.7에서 최신 trigger 하단 계약으로 보정한다.
- [x] 1.2 mobile/native surface를 보존하면서 compact avatar trigger 오른쪽에 layout 폭을 바꾸지 않는 absolute overlay drawer를 표시하고, trigger 재실행·바깥 클릭·`Escape`·선택 성공 dismissal을 제공한다.
- [x] 1.3 프로필 목록만 제한된 높이에서 스크롤하고 add/create footer를 밖에 고정하며, 선택 항목 초기 focus·방향키 이동·focus 가시성·`Escape` focus 복원을 제공한다.
- [x] 1.4 선택·생성 failure는 picker·오류와 생성 입력을 유지하고, full·compact Web의 trigger 재실행·바깥 pointer
      close·`Escape` 명시적 close는 `open=false`, `creating=false`, 빈 handle과 오류 없음으로 초기화한다.
- [x] 1.5 기존 Shell Storybook 영역의 10개 이상 typed profile fixture에서 full overlay의 navigation 위치 불변과
      outside dismissal의 pointer 대상 기본 focus·transient reset을 추가 검증하고 compact surface·기존 선택·생성
      interaction과 actor-flow E2E를 유지한다.
- [x] 1.6 관련 typecheck·Storybook test/build·기존 profile-switcher E2E를 다시 통과시키고 1280·1440px full
      overlay 시각 검증, OpenSpec scoped/all strict validation과 diff 검증 결과를 기록한다.
- [x] 1.7 full Web picker의 시각적 wrapper를 프로필 이름 trigger 바로 아래로 옮기고, trigger와 picker의 인접성,
      navigation 위치 불변, 프로필 상세·navigation 위 paint order를 Storybook interaction과 1280·1440px에서
      다시 검증한다.
- [x] 1.8 full·compact Web picker의 최대 높이를 430px로 제한하고, mobile Web drawer trigger의 닫힘/열림
      chevron과 이름·icon 내부 content의 2px 하향 광학 보정을 추가한다. Full·Compact wrapper 높이·list overflow·고정
      footer와 Mobile Web trigger geometry·navigation 불변을 기존 Shell Storybook에서 검증하고 Android/iOS 경로가
      바뀌지 않았는지 독립 리뷰한다.
