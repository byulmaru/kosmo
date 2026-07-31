## 1. PROD-619 주요 Web navigation scroll 초기화

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `PROD-619`
- Document scroll 전제 `PROD-219`; 현재 홈 재선택 경계 `PROD-610`

**Deliverable**

사용자가 Web 하단 탭, mobile drawer, compact 아이콘 레일 또는 full sidebar에서 현재와 다른 주요 route를
선택하면 target route가 document 최상단에서 표시되고, loading·empty 상태와 연속 전환에서도 source route의
scroll offset이 남지 않는다.

**Guardrails**

- 실제로 실행된 current-to-different 주요 forward navigation과 target pathname commit을 짝지어 한 번만
  초기화한다.
- Browser back/forward, search query-only 이동, current route 재선택과 Android/iOS Native navigation에는 이
  초기화를 적용하지 않는다.
- 현재 홈 재선택의 최상단 이동·단일 refetch는 `PROD-610`에 남기고 Relay 데이터 정책을 바꾸지 않는다.
- Document/window scroll ownership과 navigation guard를 유지하며 `history.scrollRestoration` manual 전환,
  smooth scroll, 중앙 internal scroller 또는 route별 reset 복제를 도입하지 않는다.
- PROD-622·PROD-623의 drawer scroll/close 변경을 이 task diff나 commit에 흡수하지 않는다.

**Verification**

- 무guard 이동, guard 승인·취소, current route 재선택, 마지막 target이 다른 연속 navigation에서 scroll intent의
  생성·소비·취소를 자동화한다.
- 각 breakpoint의 shell surface가 같은 route-scroll 정책을 사용하고 Native에서는 no-op임을 검증한다.

- [ ] 1.1 하단 탭, mobile drawer, compact 아이콘 레일과 full sidebar의 실제 navigation action이 current와 다른
      target pathname intent를 동일한 경계로 전달하게 한다.
- [ ] 1.2 target pathname이 commit된 뒤 Web document를 최상단으로 초기화하고, 새 navigation이 이전의 지연
      처리를 무효화해 마지막 target에 수렴하게 한다.
- [ ] 1.3 Guard 승인 전·취소, current route 재선택, search query-only와 Native 경로가 reset/refetch를 실행하지
      않으며 browser history restoration을 건드리지 않는지 implementation diff로 확인한다.

## 2. PROD-619 targeted Web 회귀 검증

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `docs/design/accessibility.md`
- `PROD-619`
- 현재 홈 재선택 경계 `PROD-610`; broad navigation E2E 소유 `PROD-233`

**Deliverable**

주요 route의 top 초기화와 history/query/reselection 보존이 component automation, Chromium E2E와 iPhone급 mobile
Web touch 관찰로 재현 가능하게 증명된다.

**Guardrails**

- 전체 반응형 navigation IA suite는 `PROD-233`에 남기고 PROD-619의 scroll 결과와 회귀 경계만 targeted
  assertion으로 추가한다.
- 단순 style·scrollHeight assertion으로 top 초기화나 browser restoration을 대신하지 않는다.
- Query-only 검증은 URL뿐 아니라 document scroll과 검색 입력 focus를 확인한다.
- Web 검증을 Android/iOS Native runtime 검증으로 일반화하지 않는다.

**Verification**

- `pnpm --filter @kosmo/app check`
- 관련 `pnpm --filter @kosmo/app test:unit`과 `pnpm --filter @kosmo/app test:storybook`
- 관련 `pnpm --filter @kosmo/web test:e2e -- <PROD-619 E2E file>`
- iPhone급 mobile Web viewport에서 touch로 profile/home 및 다른 bottom-tab route 전환을 수동 관찰한다.

- [ ] 2.1 Shell navigation의 무guard·guard 승인/취소, current/different pathname, 연속 target 교체와 Native no-op을
      가장 가까운 component test로 검증한다.
- [ ] 2.2 Mobile bottom tab/drawer와 compact/full sidebar에서 스크롤된 source → 다른 target의 pathname 반영,
      `window.scrollY` top, loading·empty target과 연속 route 전환을 targeted Web E2E로 검증한다.
- [ ] 2.3 Browser back/forward의 restored position, search query-only의 scroll·focus 보존, current route 재선택의
      reset/refetch 비실행을 Web E2E로 검증한다.
- [ ] 2.4 관련 app check/unit/Storybook와 Web E2E를 통과시키고 iPhone급 mobile Web touch 관찰의 viewport·입력·
      결과와 실행하지 못한 검증을 기록한다.

## 3. PROD-619 완료·handoff·archive

**Authority / Provenance**

- `docs/design/breakpoints.md`
- `PROD-619`
- 통합 검증 소유 `PROD-617`

**Deliverable**

PROD-619의 구현과 개별 검증, canonical·delta spec 정합성과 task 완료 evidence가 기록되고, 완료된 change가
archive된 뒤 PROD-617 담당자가 mobile Web 통합 검증에 사용할 수 있다.

**Guardrails**

- PR readiness와 OpenSpec archive를 분리하고, 이 change의 전체 task와 required validation이 완료되기 전에는
  archive하지 않는다.
- PROD-617의 다섯 sibling 통합 검증 완료를 PROD-619 change archive의 선행 조건으로 만들지 않는다.
- Sibling issue 변경이나 미검증 결과를 PROD-619 완료 evidence로 포함하지 않는다.
- 구현 중 새로운 제품 행동 또는 durable decision이 필요하면 canonical → Linear → OpenSpec 순서로 갱신하고
  다시 승인받는다.

**Verification**

- `pnpm exec openspec validate reset-primary-navigation-scroll --strict`
- `git diff`와 staged diff에서 PROD-619 owned 파일·hunk만 포함됐는지 확인한다.
- Archive 전 모든 task, required validation, linked PR 상태와 delta spec 정합성을 확인하고 archive 후 strict
  validation을 다시 실행한다.

- [ ] 3.1 구현·검증 diff와 branch/HEAD/commit/push 결과, 남은 위험과 실행하지 못한 검증을 handoff에 기록한다.
- [ ] 3.2 Canonical·Linear·OpenSpec과 실제 구현의 forward/history/query/reselection/Native 경계를 대조하고 strict
      validation을 통과시킨다.
- [ ] 3.3 PROD-619 전체 task와 linked PR 완료 evidence가 충족되면 change를 archive하고, mobile Web 통합 검증용
      결과를 PROD-617 담당자에게 전달한다.
