# PROD-668 팔로우 요청 통합 검증 및 OpenSpec 완료 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` for the parent-owned contract and integration work in this plan. Use the configured `implementation_reviewer` only for the final independent review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 병합된 PROD-566 화면·Relay slice와 PROD-654 Web navigation slice를 하나의 selected Profile 사용자 흐름으로 검증하고, 승인된 Web 범위만 OpenSpec에 반영해 `add-incoming-follow-request-management`를 archive한다.

**Architecture:** production App·GraphQL·DB 동작은 변경하지 않는다. 기존 `navigation-scroll.e2e.ts`의 세 Web navigation surface 증거에 selected Profile별 incoming request, Profile 전환, 승인·거절을 연결하는 한 개의 통합 E2E를 추가한다. OpenSpec은 PROD-668을 통합·archive owner로, PROD-699를 현재 change를 차단하지 않는 향후 Native QA 범위로 기록한다.

**Tech Stack:** Expo Router, React Native Web, React Relay, Playwright, PostgreSQL test database, OpenSpec `spec-driven-decisions`.

## Global Constraints

- Authority는 `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/page-header.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`, PROD-566, PROD-654, PROD-668이다.
- canonical route는 `/follow-requests`, heading은 `팔로워 요청`, navigation glyph는 `UserRoundPlus`다.
- current session의 selected Profile만 `incomingProfileFollowRequests`를 읽고 처리한다.
- 승인·거절은 서버 성공 뒤 정확한 request ID만 현재 actor connection에서 제거한다.
- full Web sidebar, compact Web rail, mobile Web drawer는 `/follow-requests`로 진입한다. mobile bottom tab과 `/menu`는 추가하지 않는다.
- Android/iOS runtime QA는 PROD-699의 향후 비차단 범위이며 이 change의 task·archive gate에 포함하지 않는다.
- Web keyboard·screen-reader 의미와 cross-slice Web E2E는 PROD-668의 완료 증거다.
- production App, GraphQL/API, DB schema·migration, notification, outgoing FollowButton와 새 dependency를 변경하지 않는다.
- 테스트 코드 범위: 기존 `apps/web/e2e/navigation-scroll.e2e.ts`의 통합 test와 필요한 file-local test setup만 변경한다.
- 테스트 필요성: 세 navigation surface의 기존 route 증거와 selected Profile 전환·승인·거절의 route 통합을 하나의 실제 App/API/DB 흐름으로 연결한다.
- 테스트 제외 범위: late-response interception 중복, 새 shared fixture/helper/platform harness, 기존 unit·Storybook 조합 반복, Native QA, unrelated E2E coverage 확대.
- Watchman이 차단되면 Relay `--noWatchman`과 TypeScript를 분리하고, E2E webServer에서 Relay 재실행만 건너뛰는 커밋하지 않는 local config를 사용한다.

---

### Task 1: PROD-668 authority와 OpenSpec 완료 경계 정렬

**Files:**

- Create: `openspec/changes/add-incoming-follow-request-management/implementation-plan-prod-668.md`
- Modify: `openspec/changes/add-incoming-follow-request-management/proposal.md`
- Modify: `openspec/changes/add-incoming-follow-request-management/design.md`
- Modify: `openspec/changes/add-incoming-follow-request-management/decisions.md`
- Modify: `openspec/changes/add-incoming-follow-request-management/tasks.md`
- Keep unless validation requires otherwise: `openspec/changes/add-incoming-follow-request-management/specs/profile-follow-request-management/spec.md`
- Keep unless validation requires otherwise: `openspec/changes/add-incoming-follow-request-management/specs/web-app-shell/spec.md`

**Interfaces:**

- Consumes: live PROD-668/699 descriptions and relations read back on 2026-08-06.
- Produces: PROD-668-owned Web completion tasks, a non-blocking PROD-699 Native QA boundary, and exact archive guardrails.

- [x] **Step 1: proposal ownership을 현재 Linear 계약에 맞춘다**

  `Authority / Provenance`에 PROD-668을 completion owner로 추가하고 PROD-699를 non-blocking deferred QA reference로 추가한다. `Impact`에는 production code/API/DB가 바뀌지 않고 integration test·spec/archive만 남았음을 기록한다.

- [x] **Step 2: design의 현재 상태와 migration plan을 갱신한다**

  이미 병합된 PROD-566/#492와 PROD-654/#504를 current state로 기록한다. 최종 통합·정합성·archive owner를 PROD-668로 바꾸고, Android/iOS runtime QA는 PROD-699에서 향후 수행하되 현재 archive를 막지 않는다고 명시한다. Web keyboard/screen-reader와 cross-slice E2E는 유지한다.

- [x] **Step 3: durable verification boundary decision을 추가한다**

  `decisions.md`에 다음 속성의 record를 추가한다.

  ```md
  ### PROD-668 완료는 Web 통합 증거로 한정하고 Native QA는 후속으로 분리한다

  - Decision Date: 2026-08-06
  - Decision Class: Derived Contract
  - Authority / Provenance: `PROD-668`, `PROD-699`
  - Status: Active
  ```

  Outcome은 Web Relay/component 자동화, cross-slice E2E, keyboard·screen-reader 의미를 현재 완료 증거로 사용하고 Android/iOS runtime 결과는 PROD-699에만 기록한다. 대안은 Native evidence까지 archive를 막는 기존 gate와 Native를 검증 완료로 간주하는 방식이며 둘 다 승인된 운영 범위와 맞지 않아 제외한다.

- [x] **Step 4: tasks의 owner와 task 2.4/4.x guardrail을 갱신한다**

  task 2.4의 runtime 문구에서 Android/iOS를 제거하고 Web keyboard·screen-reader를 유지한다. section 4 heading과 provenance에 PROD-668을 추가하고, 4.1은 child slice evidence 대조, 4.2는 compositional Web flow, 4.3은 active spec sync/archive, 4.4는 post-archive strict validation으로 유지한다.

- [x] **Step 5: strict validation으로 artifact 정합성을 확인한다**

  Run:

  ```bash
  ./node_modules/.bin/openspec validate add-incoming-follow-request-management --strict
  git diff --check
  ```

  Expected: 둘 다 exit 0. 아직 통합·runtime evidence가 없으므로 2.4와 4.1–4.4 checkbox는 이 단계에서 완료하지 않는다.

---

### Task 2: selected Profile 승인·거절 cross-slice Web E2E

**Files:**

- Modify/Test: `apps/web/e2e/navigation-scroll.e2e.ts`
- Read-only pattern source: `apps/web/e2e/profile-switcher.e2e.ts`
- Read-only fixture source: `apps/web/e2e/db-fixtures.ts`

**Interfaces:**

- Consumes: `createE2ESession`, `createE2EAccountProfile`, `setE2ESessionCookie`, `followProfile`, `waitForGraphQLOperation`, existing `visiblePrimaryNavigation`.
- Produces: one Playwright test proving navigation entry plus actor-specific list, Profile switch, approve, reject, and exact row disappearance. No exported helper or production interface is added.

- [x] **Step 1: file-local ProfileSwitcher helper와 literal fixtures를 작성한다**

  `navigation-scroll.e2e.ts` 안에서만 다음 existing interaction을 재사용한다.

  ```ts
  async function selectProfileFromSwitcher(page: Page, handle: string) {
    const response = waitForGraphQLOperation(page, 'ProfileSwitcherSelectProfileMutation');
    await page.getByRole('button', { name: '프로필 목록' }).first().click();
    await page
      .getByLabel('전환할 프로필 목록')
      .getByRole('button')
      .filter({ hasText: `@${handle}` })
      .click();
    await response;
    await expect(page.getByRole('progressbar')).toHaveCount(0);
  }
  ```

  Recipient A session과 같은 Account의 recipient B를 만들고 둘 다 `APPROVAL_REQUIRED`로 둔다. 서로 다른 follower A/B가 각 recipient에 `followProfile`을 호출해 `PENDING` 결과를 만들도록 literal fixture를 구성한다. shared fixture API는 추가하지 않는다.

- [x] **Step 2: 통합 test를 먼저 작성한다**

  Test name:

  ```ts
  test('팔로워 요청 route는 navigation 진입 뒤 selected Profile별 승인·거절을 격리한다', async ({
    context,
    page,
  }) => {
    // recipient A/B와 follower A/B pending request setup
    // full sidebar의 팔로워 요청 link로 route 진입
    // A row만 보이고 B row는 보이지 않음
    // Profile B 전환 뒤 B row만 보이고 A row는 보이지 않음
    // B 승인 성공 뒤 B row 제거
    // Profile A 복귀 뒤 A 거절 성공 뒤 A row 제거
  });
  ```

  Literal assertions:

  ```ts
  await expect(page.getByRole('link', { name: 'Follower A 프로필로 이동' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Follower B 프로필로 이동' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Follower B 팔로우 요청 승인' }).click();
  await expect(page.getByRole('button', { name: 'Follower B 팔로우 요청 승인' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Follower A 팔로우 요청 거절' }).click();
  await expect(page.getByRole('button', { name: 'Follower A 팔로우 요청 거절' })).toHaveCount(0);
  ```

  이 test가 잡아야 하는 production break는 `/follow-requests` destination 제거, selected actor environment 미교체, 잘못된 actor connection 표시, approve/reject updater 누락이다.

- [x] **Step 3: 현재 구현에 대한 GREEN을 확인한다**

  Watchman이 정상인 환경:

  ```bash
  node scripts/test-db.mjs run -- pnpm test:e2e:database -- navigation-scroll.e2e.ts
  ```

  Watchman이 차단된 현재 worktree에서는 먼저 Relay를 생성한 뒤 커밋하지 않는 local Playwright config가 App build의 `pnpm relay`만 생략하게 한다.

  ```bash
  pnpm --filter @kosmo/app exec relay-compiler --noWatchman
  pnpm --filter @kosmo/app exec tsc --noEmit
  node scripts/test-db.mjs run -- pnpm --filter @kosmo/web exec playwright test --config playwright.local-no-watchman.config.ts navigation-scroll.e2e.ts
  ```

  Expected: 기존 4 tests와 새 integration test가 모두 PASS한다.

- [x] **Step 4: mutation sensitivity를 확인한다**

  Production code는 최종 diff에 포함하지 않는다. test가 GREEN인 뒤 한 번만 `SidebarNavigation`의 `/follow-requests` href를 임시 잘못된 literal로 바꿔 targeted E2E가 route assertion에서 FAIL하는 것을 관찰하고 즉시 원복한다. `git diff`로 production 파일이 완전히 복구됐음을 확인한다.

- [x] **Step 5: E2E checkpoint를 검토한다**

  `git diff -- apps/web/e2e/navigation-scroll.e2e.ts`에 test와 file-local setup만 있는지 확인한다. 새 shared helper, production file, schema, migration이나 dependency diff가 있으면 중단한다.

---

### Task 3: Web keyboard·screen-reader runtime evidence

**Files:**

- Modify after evidence: `openspec/changes/add-incoming-follow-request-management/tasks.md`
- No product code or new accessibility harness.

**Interfaces:**

- Consumes: Task 2와 같은 seeded Web runtime.
- Produces: actual keyboard focus/activation observations and browser accessibility-tree role/name/state evidence. Real screen-reader audio was not run unless explicitly available.

- [x] **Step 1: keyboard flow를 실행한다**

  Web runtime에서 Tab/Shift+Tab으로 requester Profile link, `승인`, `거절`을 각각 도달하고 Enter/Space가 올바른 target만 활성화하는지 확인한다. pending 동안 해당 row의 두 action만 disabled/busy이며 다른 row target은 사용 가능한지 확인한다.

- [x] **Step 2: screen-reader semantics를 확인한다**

  브라우저 accessibility tree에서 Profile link와 approve/reject button의 role/name, pending의 disabled/busy, failure alert가 분리되어 있는지 확인한다. 실제 VoiceOver/NVDA audio를 실행하지 못하면 이를 browser accessibility-tree evidence로 정확히 기록하고 실제 screen-reader runtime으로 일반화하지 않는다.

- [x] **Step 3: evidence가 완료 조건을 만족하는지 판단한다**

  keyboard와 accessibility-tree evidence가 승인된 Web gate를 만족하면 task 2.4 evidence에 기록한다. 실제 screen-reader audio가 필수인데 실행할 수 없으면 2.4를 체크하지 않고 PROD-668 owner gate로 반환한다.

---

### Task 4: task 완료, active spec sync와 archive

**Files:**

- Modify: `openspec/changes/add-incoming-follow-request-management/tasks.md`
- Sync/Create through archive workflow: `openspec/specs/profile-follow-request-management/spec.md`
- Modify through archive workflow: `openspec/specs/web-app-shell/spec.md`
- Archive through workflow: `openspec/changes/archive/2026-08-06-add-incoming-follow-request-management/**`

**Interfaces:**

- Consumes: Task 1–3 evidence and latest PROD-566/654/668/699 read-back.
- Produces: completed tasks, canonical active specs, archived change, post-archive strict validation.

- [x] **Step 1: task 2.4와 4.1–4.2 evidence를 기록한다**

  Automation, Web keyboard/accessibility-tree runtime, hosted historical CI와 실행하지 않은 actual screen-reader audio를 구분한다. Task 2.4와 4.1–4.2는 각각의 실제 evidence가 있을 때만 `[x]`로 바꾼다.

- [x] **Step 2: pre-archive 검증을 실행한다**

  ```bash
  ./node_modules/.bin/openspec validate add-incoming-follow-request-management --strict
  pnpm --filter @kosmo/app exec relay-compiler --noWatchman
  pnpm --filter @kosmo/app exec tsc --noEmit
  pnpm --filter @kosmo/app test:unit
  pnpm --filter @kosmo/app test:storybook
  pnpm --filter @kosmo/app build-storybook
  pnpm lint:eslint
  pnpm lint:prettier
  git diff --check
  ```

- [x] **Step 3: archive skill로 active specs를 동기화하고 change를 archive한다**

  `openspec-archive-change`를 읽고 exact change를 archive한다. 수동 파일 이동이나 날짜 추정으로 대체하지 않는다. task 4.3은 active spec 정합과 archive 결과가 존재한 뒤에만 완료한다.

- [x] **Step 4: post-archive strict validation을 실행한다**

  ```bash
  ./node_modules/.bin/openspec validate --all --strict
  git diff --check
  ```

  통과 결과를 archived task evidence에 기록하고 task 4.4를 완료한다.

---

### Task 5: 독립 리뷰와 publication checkpoint

**Files:**

- Review: exact branch diff only.
- No Linear/GitHub writes without a new exact preview.

**Interfaces:**

- Consumes: all diffs and verification output.
- Produces: `REVIEW_PACKET_V1`, clean local commits, and a separately approved Draft PR proposal.

- [x] **Step 1: implementation_reviewer 독립 리뷰를 실행한다**

  Review scope는 PROD-668/699 authority, OpenSpec diff, integration E2E, test sensitivity, verification gaps와 archive 결과다. 승인 범위 밖의 Native QA나 production redesign은 요구하지 않는다.

- [x] **Step 2: 확인된 finding만 수정한다**

  코드 finding이면 failing regression evidence를 먼저 확보한다. 문서 정합 finding이면 canonical→Linear→OpenSpec authority 순서를 지킨다. 수정 뒤 관련 검증을 다시 실행한다.

- [x] **Step 3: verification-before-completion을 적용한다**

  `git status --short`, `git diff`, `git diff --cached`, OpenSpec all strict와 주요 test 결과를 새로 확인한다. 임시 Playwright config와 production mutation이 남아 있지 않아야 한다.

- [x] **Step 4: 의도별 checkpoint commit을 만든다**

  첫 commit은 integration E2E, 두 번째 commit은 authority 정렬·active spec sync·archive와 최종 evidence를 소유한다. `.superpowers/**`, `docs/superpowers/**`, generated Relay artifact와 temporary local config를 stage하지 않는다. agent `Co-authored-by` trailer를 추가하지 않는다.

- [ ] **Step 5: Draft PR 공개 변경을 별도 승인받는다**

  push 전에 exact commit scope를 보여준다. Korean Draft PR title/body에는 PROD-668, PROD-566/654 merge evidence, PROD-699 non-blocking boundary, verification, actual screen-reader limitation과 archive 결과를 기록한다. exact wording·target·review request를 사용자가 승인한 뒤에만 push/PR/Linear status mutation을 수행한다.
