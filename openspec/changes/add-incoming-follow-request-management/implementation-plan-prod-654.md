# PROD-654 반응형 팔로워 요청 진입점 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 준비된 `/follow-requests` 화면으로 이동하는 `팔로워 요청` 진입점을 full Web sidebar, compact Web rail과 mobile drawer에 복원한다.

**Architecture:** `SidebarNavigation`의 단일 navigation 배열에 static route item을 복원한다. `UniversalShell`이 이 컴포넌트를 세 surface에서 공유하므로 별도 prop, feature gate나 surface별 분기를 추가하지 않는다. 기존 Shell Storybook과 `navigation-scroll` Playwright E2E를 확장해 노출, 아이콘, destination, active state, drawer close와 제외 범위를 검증한다.

**Tech Stack:** Expo Router, React Native Web, Lucide React Native, Storybook Vitest browser tests, Playwright, OpenSpec.

## Global Constraints

- Canonical destination은 `/follow-requests`, label은 `팔로워 요청`, glyph는 Lucide `UserRoundPlus`다.
- full Web sidebar, compact Web rail과 mobile drawer는 동일한 shared navigation item을 사용한다.
- mobile bottom tab과 generic `/menu`를 추가하거나 복원하지 않는다.
- `UniversalShell`, `BottomTabBar`, Follow Request 화면·Relay·API·DB, notification/push/realtime은 수정하지 않는다.
- 기존 feedback, Profile, Bookmark, logout, active state와 drawer close 동작을 유지한다.
- 테스트 코드 범위: `Shell.stories.tsx`와 기존 `navigation-scroll.e2e.ts`의 최소 assertion·interaction만 변경한다.
- 테스트 필요성: 세 surface가 준비된 route에 연결되고 PROD-541의 dead-entry 제거 범위를 넘지 않음을 증명한다.
- 테스트 제외 범위: 새 fixture/helper/harness, PROD-566 목록·mutation, unrelated shell snapshot·coverage 확대.
- Web keyboard·screen-reader와 Android/iOS drawer touch target은 실제 runtime에서 관찰한 범위만 기록한다. 증거가 없으면 OpenSpec task 3.3을 완료 처리하지 않는다.

---

### Task 1: shared navigation 진입점과 직접 회귀 검증

**Files:**

- Modify: `apps/app/src/stories/Shell.stories.tsx`
- Modify: `apps/web/e2e/navigation-scroll.e2e.ts`
- Modify: `apps/app/src/components/shell/SidebarNavigation.tsx`

**Interfaces:**

- Consumes: 기존 `NavigationItem`, `GuardedLink`, `visiblePrimaryNavigation(page)`와 mobile drawer `#mobile-sidebar`.
- Produces: `{ href: '/follow-requests', Icon: UserRoundPlus, label: '팔로워 요청' }` static shared item. 공개 component prop이나 GraphQL fragment는 변경하지 않는다.

- [x] **Step 1: Storybook에 실패하는 shared surface 계약을 먼저 작성한다**

  `SharedNavigation`, `CompactSidebar`, `UniversalMobile`의 기존 비노출 assertion을 실제 link 계약으로 바꾼다. exact glyph는 사용자에게 렌더되는 Lucide path로 확인한다.

  ```tsx
  const followRequests = canvas.getByRole('link', { name: '팔로워 요청' });
  expect(followRequests).toHaveAttribute('href', '/follow-requests');
  expect(followRequests.querySelector('path')).toHaveAttribute('d', 'M2 21a8 8 0 0 1 13.292-6');
  ```

  `BottomNavigation`에는 다음 비노출 assertion을 유지·추가한다.

  ```tsx
  expect(canvas.queryByRole('link', { name: '팔로워 요청' })).not.toBeInTheDocument();
  ```

  `/follow-requests` pathname에서 current state를 직접 검증하는 story를 추가한다.

  ```tsx
  export const FollowRequestsNavigationCurrentState: Story = {
    parameters: { router: { pathname: '/follow-requests' } },
    play: ({ canvasElement }) => {
      const canvas = within(canvasElement);
      const link = canvas.getByRole('link', { name: '팔로워 요청' });
      expect(link).toHaveAttribute('href', '/follow-requests');
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
    },
  };
  ```

- [x] **Step 2: Playwright에 실패하는 responsive route 계약을 작성한다**

  `navigation-scroll.e2e.ts`에 기존 session/database fixture를 재사용하는 별도 test를 추가한다.

  ```ts
  test('팔로워 요청 진입점은 full, compact와 mobile drawer에서 canonical route를 연다', async ({
    page,
  }) => {
    await signIn(page, 'e2e-follow-request-navigation');

    for (const viewport of [
      { height: 720, width: 1440 },
      { height: 720, width: 1024 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/home');
      const navigation = await visiblePrimaryNavigation(page);
      const link = navigation.getByRole('link', { name: '팔로워 요청', exact: true });
      await expect(link).toHaveAttribute('href', '/follow-requests');
      await expect(navigation.locator('a[href="/menu"]')).toHaveCount(0);
      await link.click();
      await expect(page).toHaveURL(/\/follow-requests$/);
      await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
      await expect(
        (await visiblePrimaryNavigation(page)).getByRole('link', {
          name: '팔로워 요청',
          exact: true,
        }),
      ).toHaveAttribute('aria-current', 'page');
    }

    await page.setViewportSize({ height: 720, width: 390 });
    await page.goto('/home');
    await expect(
      (await visiblePrimaryNavigation(page)).getByRole('link', {
        name: '팔로워 요청',
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: '메뉴 열기' }).click();
    const drawer = page.locator('#mobile-sidebar');
    const drawerNavigation = drawer.getByRole('navigation', { name: '주요 메뉴' });
    const drawerLink = drawerNavigation.getByRole('link', {
      name: '팔로워 요청',
      exact: true,
    });
    await expect(drawerLink).toHaveAttribute('href', '/follow-requests');
    await expect(drawerNavigation.locator('a[href="/menu"]')).toHaveCount(0);
    await drawerLink.tap();
    await expect(page).toHaveURL(/\/follow-requests$/);
    await expect(page.getByRole('heading', { name: '팔로워 요청' })).toBeVisible();
    await expect(drawer).toHaveCount(0);
  });
  ```

- [x] **Step 3: RED를 확인한다**

  Run:

  ```bash
  pnpm --filter @kosmo/app test:storybook -- src/stories/Shell.stories.tsx
  node scripts/test-db.mjs run -- pnpm test:e2e:database -- navigation-scroll.e2e.ts
  ```

  Expected: Storybook의 full/compact/mobile link 조회와 Playwright의 첫 `팔로워 요청` link 조회가 현재 item 부재 때문에 실패한다. Watchman/FSEvents가 local E2E build를 막으면 제품 실패와 구분해 기록하고, Relay `--noWatchman` 컴파일을 사용하는 비커밋 local test config로 같은 Playwright spec을 실행한다.

- [x] **Step 4: 최소 production 변경으로 GREEN을 만든다**

  `SidebarNavigation.tsx`의 Lucide import에 `UserRoundPlus`를 추가하고 기존 복원 위치인 `북마크` 뒤에 item 하나만 추가한다.

  ```tsx
  import {
    Bell,
    Bookmark,
    House,
    Mail,
    PenLine,
    Search,
    UserRound,
    UserRoundPlus,
  } from 'lucide-react-native';

  const navigation: NavigationItem[] = [
    { href: '/home', Icon: House, label: '홈' },
    { href: '/search', Icon: Search, label: '검색' },
    { href: '/notifications', Icon: Bell, label: '알림' },
    { Icon: UserRound, label: '프로필', profile: true },
    { href: '/bookmarks', Icon: Bookmark, label: '북마크' },
    { href: '/follow-requests', Icon: UserRoundPlus, label: '팔로워 요청' },
  ];
  ```

- [x] **Step 5: targeted GREEN과 회귀를 확인한다**

  Run:

  ```bash
  pnpm --filter @kosmo/app test:storybook -- src/stories/Shell.stories.tsx
  node scripts/test-db.mjs run -- pnpm test:e2e:database -- navigation-scroll.e2e.ts
  pnpm --filter @kosmo/app check
  ```

  Expected: Storybook과 navigation E2E가 통과하고 Relay compiler/TypeScript가 새 import와 route href를 허용한다.

### Task 2: OpenSpec evidence와 repository 검증

**Files:**

- Modify: `openspec/changes/add-incoming-follow-request-management/tasks.md`
- Keep: `openspec/changes/add-incoming-follow-request-management/implementation-plan-prod-654.md`

**Interfaces:**

- Consumes: Task 1의 passing Storybook/E2E/check 결과와 실제 runtime 관찰.
- Produces: OpenSpec task 3.1·3.2 완료 evidence. Task 3.3은 자동화와 platform runtime QA가 모두 존재할 때만 완료한다.

- [x] **Step 1: task 3.1과 3.2를 완료 처리하고 검증 기록을 추가한다**

  `tasks.md`에서 실제 코드와 tests가 통과한 뒤에만 3.1·3.2를 `- [x]`로 바꾼다. 날짜가 있는 검증 기록에는 명령별 pass/fail과 다음 runtime 상태를 분리한다.

  ```md
  - not run — 실제 Web keyboard·screen-reader와 Android/iOS drawer touch target runtime QA. 해당 증거가 없으면 3.3은 완료 처리하지 않는다.
  ```

- [x] **Step 2: OpenSpec과 repository 검증을 실행한다**

  Run:

  ```bash
  pnpm exec openspec validate add-incoming-follow-request-management --strict
  pnpm --filter @kosmo/app test:unit
  pnpm lint:eslint
  pnpm lint:prettier
  ```

  Expected: 모든 명령이 exit 0이다. 실제로 실행하지 못한 Web/Android/iOS runtime QA는 passing automation과 구분한다.

- [x] **Step 3: 구현 diff를 독립 리뷰한다**

  Review scope: `SidebarNavigation.tsx`, `Shell.stories.tsx`, `navigation-scroll.e2e.ts`, `tasks.md`, 이 계획 파일. 승인 범위, 정확성, 접근성 semantics, drawer close, bottom tab·`/menu` 비노출과 검증 공백을 확인한다.

- [x] **Step 4: 승인된 파일만 하나의 checkpoint commit으로 준비한다**

  `$kosmo-codex-workflows:commit-safely`를 사용해 `.superpowers/**`, `docs/superpowers/**`가 staged되지 않았음을 확인한다. 커밋·push·Draft PR·Linear 상태 변경은 사용자에게 정확한 diff와 외부 변경 초안을 보여주고 승인받은 뒤 수행한다.
