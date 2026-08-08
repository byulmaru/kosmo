## 1. PROD-566 받은 요청 route와 목록 상태

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `docs/design/page-header.md`
- `docs/design/accessibility.md`
- `PROD-272`
- `PROD-566`

**Deliverable**

인증된 사용자가 공통 `PageHeader`의 `/follow-requests` 화면에서 현재 selected Profile의 받은 pending 요청과 초기·pagination 상태를 확인할 수 있다.

**Guardrails**

- 다른 Profile이나 root query에 pending request를 노출하지 않는다.
- opaque cursor와 deterministic order를 유지하고 page size·정렬 방향을 새 공개 계약으로 고정하지 않는다.
- requester가 unavailable인 request를 숨기지 않고 fallback과 reject-only 상태로 남긴다.
- 요청 시각을 표시하지 않는다.

**Verification**

- 테스트 코드 범위: route boundary와 목록의 loading, empty, initial error, populated, unavailable requester, 다음 페이지 성공·실패를 직접 검증하는 최소 component/Relay test와 Storybook 상태.
- 테스트 필요성: 공통 `PageHeader`, selected Profile connection, 기존 목록 보존과 fallback cleanup 가능성을 증명한다.
- 테스트 제외 범위: 공개 followers/following 목록, notification, 기존 FollowButton 조합과 새 test harness.
- Relay compiler, TypeScript, 관련 unit·Storybook test와 Storybook build를 실행한다.

- [x] 1.1 공통 `PageHeader`에 `팔로워 요청` heading을 제공하는 protected `/follow-requests` 화면과 selected Profile route boundary를 구현한다.
- [x] 1.2 selected Profile의 incoming connection을 loading, empty, initial error와 자동 cursor pagination 상태로 표시한다.
- [x] 1.3 일반 requester 정보와 Profile link, unavailable requester fallback·reject-only presentation을 접근 가능한 별도 target으로 제공한다.
- [x] 1.4 route·목록 상태를 직접 검증하는 최소 component/Relay test와 Storybook 상태를 추가하고 관련 check를 통과시킨다.

## 2. PROD-566 승인·거절과 actor 상태 격리

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `docs/design/accessibility.md`
- `PROD-272`
- `PROD-566`
- `PROD-668` — completion·archive owner handoff와 현재 Web evidence gate
- `PROD-699` — deferred non-blocking 실제 Web screen-reader·Native runtime QA

PROD-668/699의 2026-08-06 handoff가 PROD-566의 초기 completion·archive ownership과 미실행 runtime QA gate를 대체한다. PROD-566의 기능·Relay deliverable과 기존 자동화 증거는 그대로 유지한다.

**Deliverable**

사용자가 요청 행에서 승인·거절을 처리하고 성공 결과를 정확한 connection에 반영하며, 실패와 Profile 전환에서도 복구 가능한 상태를 유지할 수 있다.

**Guardrails**

- 서버 성공 전 요청 행을 제거하지 않는다.
- 처리 중에는 해당 행의 승인·거절만 잠그고 다른 행을 전역으로 막지 않는다.
- 삭제 ID에 대응하는 현재 actor connection의 요청만 제거한다.
- 이전 actor의 목록, pending, error와 늦은 응답을 새 selected Profile에 재사용하지 않는다.

**Verification**

- 테스트 코드 범위: approve/reject 성공, 실패·같은 동작 재시도, 행별 동시 처리, 정확한 edge 제거, approve follow normalization과 Profile 전환 race를 직접 검증하는 최소 Relay/component test.
- 테스트 필요성: pending-only terminal 처리, stale connection 방지와 actor cache 격리를 증명한다.
- 테스트 제외 범위: GraphQL API lifecycle 중복 통합 test, optimistic UI 조합, 전역 toast infrastructure와 unrelated Relay cache coverage.
- Web keyboard runtime과 browser accessibility-tree에서 action target의 role/name, busy/disabled·progressbar와 failure alert 의미를 확인한다. 실제 Web VoiceOver/NVDA announcement와 Android/iOS runtime QA는 PROD-699의 향후 비차단 범위이며 이 task의 완료 증거로 요구하지 않는다.

- [x] 2.1 각 요청 행에 분리된 승인·거절 동작과 행별 pending, inline error, 같은 동작 재시도를 구현한다.
- [x] 2.2 approve/reject 성공 payload의 삭제 ID로 현재 connection의 정확한 요청을 제거하고 approve follow 관계를 정규화한다.
- [x] 2.3 selected Profile 전환 시 목록·pagination·행 state와 늦은 이전 actor 응답을 격리한다.
- [x] 2.4 승인·거절과 actor 격리의 최소 Relay/component test를 추가하고 정적·runtime 검증 결과를 기록한다.

**2026-08-03 검증 기록**

- passed — `pnpm --filter @kosmo/app check`: Relay 99 reader / 63 normalization / 107 operation text와 TypeScript 검사
- passed — `pnpm --filter @kosmo/app test:unit`: 175 tests, including route actor lifecycle 4, pagination metric 3, Relay actor Store removal 2
- passed — targeted `FollowRequests.stories.tsx`: 9 interactions, including common header states, regular/unavailable requester, row-local pending, mutation failure/retry, approve/reject exact removal, approve participant count normalization, automatic pagination retry와 late previous-actor response isolation
- passed — `pnpm --filter @kosmo/app build-storybook`와 전체 `pnpm --filter @kosmo/app test:storybook`: 282 tests
- passed — `pnpm lint:eslint`, `pnpm lint:prettier`, `pnpm exec openspec validate add-incoming-follow-request-management --strict`
- not run — Web keyboard runtime과 browser accessibility-tree의 action target·busy/disabled 의미 확인. 해당 증거가 없으므로 당시 2.4는 완료 처리하지 않았다.
- deferred, non-blocking — 실제 Web VoiceOver/NVDA announcement와 Android/iOS runtime QA는 PROD-699에서 향후 QA 관련 이슈들과 함께 수행하며 이 task와 change archive를 차단하지 않는다.

**2026-08-06 PROD-668 완료 검증 기록**

- passed — 실제 Playwright Web runtime에서 requester Profile link → 승인 → 거절의 Tab/Shift+Tab focus 순서와 Enter 승인·거절을 확인했다. 승인·거절 후 대상 row가 제거되고 Profile 전환 전후 다른 actor의 row가 노출되지 않았다.
- passed — 실행 중인 Storybook Web의 browser accessibility tree에서 requester link와 승인·거절 button의 분리된 role·accessible name을 확인했다. row-local pending에서는 대상 행의 승인·거절만 disabled이고 승인 control 아래 `별빛 여행자 팔로우 요청 승인 처리 중` progressbar가 노출되며 다른 행의 action은 enabled였다. error state는 별도 `alert`로 노출됐다.
- deferred, non-blocking — 실제 VoiceOver/NVDA announcement audio와 Android/iOS runtime QA는 실행하지 않았고 PROD-699가 소유한다. 위 accessibility-tree 증거는 browser accessibility-tree의 role·name·disabled·progressbar·alert 의미에 한정하며 실제 announcement나 저장소 전체 접근성 적합성으로 일반화하지 않는다.

## 3. PROD-654 반응형 navigation 진입점 복원

**Authority / Provenance**

- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-541`
- `PROD-654`

**Deliverable**

준비된 `/follow-requests` 화면으로 이동하는 `팔로워 요청` 진입점이 full Web sidebar, compact Web rail과 mobile Web drawer에 동일하게 제공된다.

**Guardrails**

- Lucide `UserRoundPlus`와 canonical `/follow-requests` destination을 사용한다.
- route가 준비되기 전에 진입점만 노출하지 않는다.
- mobile bottom tab과 generic `/menu`를 추가하지 않는다.
- 기존 feedback, Profile, Bookmark, logout, active state와 drawer close 동작을 유지한다.
- Android/iOS UI·runtime QA와 Native touch target은 이 navigation slice에서 제외하고 기존 Native shell 동작을 변경하지 않는다.
- 기존 shared navigation의 role·accessible name·current state·focus·keyboard·drawer lifecycle 계약을 재사용한다.

**Verification**

- 테스트 코드 범위: shared navigation item의 full/compact/mobile Web 표시, label·destination·순서, drawer close·active state와 bottom tab·`/menu` 비노출을 직접 검증하는 최소 shell component/Storybook/Web E2E 영역.
- 테스트 필요성: PROD-541의 dead-entry 제거 회귀 없이 세 Web surface가 준비된 route로 연결되고 기존 shared navigation semantics를 유지함을 증명한다.
- 테스트 제외 범위: Lucide 내부 SVG/path 1:1 assertion, 항목별 수동 Web keyboard·screen reader QA, Android/iOS UI·runtime QA, Native touch target, PROD-566 목록·mutation 동작, notification activation, unrelated shell snapshot·fixture 확대.
- production navigation mapping의 `UserRoundPlus` 사용은 코드 리뷰와 Storybook 표시로 확인하고, 자동화는 라이브러리 내부 DOM 구조에 결합하지 않는다.

- [x] 3.1 full Web sidebar, compact Web rail과 mobile Web drawer의 shared navigation ownership에 `팔로워 요청`·`UserRoundPlus`·`/follow-requests` 진입점을 복원한다.
- [x] 3.2 기존 navigation 동작을 유지하고 bottom tab·`/menu`가 추가되지 않음을 검증한다.
- [x] 3.3 최소 shell component/Storybook/Web E2E 검증과 승인된 Web-only 제외 범위를 기록한다.

**2026-08-04 검증 기록**

- passed — targeted `Shell.stories.tsx`: 전체 20 files / 289 interactions, including full·compact·mobile Web drawer의 `팔로워 요청` label·`/follow-requests`, 항목 순서, active state와 bottom tab 비노출. production mapping은 `UserRoundPlus`를 사용하며 test는 Lucide 내부 SVG path를 고정하지 않는다.
- passed — `node scripts/test-db.mjs run -- pnpm test:e2e:database -- navigation-scroll.e2e.ts`: 4 tests, including full·compact·mobile Web drawer route 진입, drawer close와 bottom tab·`/menu` 비노출
- passed — `pnpm --filter @kosmo/app check`: Relay 99 reader / 63 normalization / 107 operation text와 TypeScript 검사. 현재 worktree의 Watchman FSEvents 등록 실패는 비커밋 `relay-compiler --noWatchman` local workaround로 우회했다.
- passed — `pnpm --filter @kosmo/app test:unit`: 175 tests
- passed — 기존 local Storybook executable의 `build --disable-telemetry`: production bundle 생성
- passed — `pnpm lint:eslint`, 기존 local executable의 Prettier 전체 check와 `openspec validate add-incoming-follow-request-management --strict`
- excluded by approved PROD-654 scope — Android/iOS UI·runtime QA, Native touch target과 항목별 수동 Web keyboard·screen reader 1:1 QA. 기존 shared navigation 접근성 계약과 Storybook addon-a11y·Web E2E를 재사용한다.
- not rerun by explicit user direction — Web-only 문서 정렬과 Lucide 내부 SVG path assertion 3개 제거 후 local 검증은 다시 실행하지 않았다. 위 passing evidence는 production navigation 동작이 같은 이전 HEAD에서 확보했으며, push 이후 hosted CI가 새 HEAD를 검증한다.

## 4. PROD-668 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/follow-request.md`
- `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`
- `docs/design/page-header.md`
- `docs/design/accessibility.md`
- `docs/design/breakpoints.md`
- `PROD-272`
- `PROD-566`
- `PROD-654`
- `PROD-668`
- `PROD-699` — deferred non-blocking 실제 Web screen-reader·Native QA boundary

**Deliverable**

화면과 navigation slice가 하나의 사용자 흐름으로 동작하고 최신 canonical·Linear·OpenSpec과 정합한 상태로 검증·archive된다.

**Guardrails**

- 두 구현 이슈가 각자 소유한 deliverable과 verification을 완료하기 전 change를 archive하지 않는다.
- passing automation, Web keyboard runtime, browser accessibility-tree evidence와 PROD-699로 분리한 실제 screen-reader·Native runtime QA를 구분해 기록한다.
- 실제 Web VoiceOver/NVDA announcement와 Android/iOS runtime QA는 PROD-699에만 기록하고 현재 완료·archive를 차단하지 않는다.
- DB·GraphQL lifecycle, outgoing FollowButton와 notification 범위를 확장하지 않는다.

**Verification**

- 테스트 코드 범위: 기존 slice test로 증명되지 않는 세 navigation surface → `/follow-requests` → selected Profile 전환 → approve/reject 사용자 흐름에 필요한 최소 cross-slice Web E2E만 추가한다.
- 테스트 필요성: 두 PR을 함께 사용해야만 확인되는 route·navigation·actor 통합을 증명한다.
- 테스트 제외 범위: 구현 이슈 test 반복, archive-only test helper와 새로운 platform harness.
- 최신 Linear·canonical 문서를 독립 대조하고 `openspec validate add-incoming-follow-request-management --strict`, archive 후 전체 strict validation을 통과시킨다.
- 세 navigation surface의 route 증거와 대표 Web surface의 selected Profile·approve/reject flow를 조합해 중복 action E2E를 만들지 않는다.

- [x] 4.1 PROD-566과 PROD-654의 담당 task·test·Web runtime 완료 증거를 대조하고 PROD-699가 비차단 후속 범위임을 확인한다.
- [x] 4.2 세 shell surface에서 `/follow-requests`로 진입해 selected Profile 목록·전환·승인·거절이 연결되는 최소 cross-slice 흐름을 검증한다.
- [x] 4.3 active specs와 구현 정합성을 확인하고 모든 task가 완료된 뒤 change를 archive한다.
- [x] 4.4 archive 후 OpenSpec strict validation과 최종 repository check 결과를 기록한다.

**2026-08-06 PROD-668 통합 검증 기록**

- passed — PROD-566 PR #492와 PROD-654 PR #504가 승인·병합되고 current main의 ancestor이며 각 OpenSpec slice 1.x, 2.1–2.3, 3.x와 자동화 증거가 완료됐음을 대조했다. PROD-699는 Linear에서 이 change를 차단하지 않는 향후 실제 Web screen-reader·Native QA로 확인했다.
- passed — Watchman 우회용 비커밋 local config에서 `navigation-scroll.e2e.ts` 5 tests. 기존 full sidebar·compact rail·mobile Web drawer route 증거와 대표 full sidebar의 selected Profile A/B 격리, keyboard 승인·거절, 대상 row 제거를 조합해 검증했다. exact-ID 제거는 기존 Relay/Storybook 자동화 증거로 확인했다.
- passed — `/follow-requests` destination을 임시로 깨뜨렸을 때 새 integration test가 canonical route assertion에서 실패했고, 즉시 원복한 뒤 production diff가 없음을 확인했다.
- passed — delta의 5개 `profile-follow-request-management` 요구사항을 새 active spec에 추가하고, `web-app-shell`의 기존 준비 전 비노출 계약을 보존하면서 준비 후 `/follow-requests` 진입점 scenario를 동기화했다. change는 `openspec/changes/archive/2026-08-06-add-incoming-follow-request-management/`로 archive했다.
- passed — archive 후 `openspec validate --all --strict`: 83 items, 0 failed. `git diff --check`와 archived change·active specs 대상 Prettier check도 통과했다.
