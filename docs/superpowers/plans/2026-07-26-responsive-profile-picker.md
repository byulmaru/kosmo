# Responsive Profile Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Web full sidebar와 compact icon rail에 각각 자연스러운 profile picker를 제공하고, 긴 프로필 목록에서도 선택과 생성을 계속 사용할 수 있게 한다.

**Architecture:** `ProfileSwitcher`가 기존 Relay 선택·생성 흐름, trigger, picker content와 transient state를 계속 소유하되 `full | compact | drawer` surface를 명시적으로 받는다. `SidebarNavigation`은 닫힌 full profile summary를 260px로 유지하고 full picker를 프로필 이름 trigger 바로 아래의 anchored absolute overlay로 표시해 navigation 위치를 보존한다. `UniversalShell`은 full·compact picker가 열릴 때 sidebar stacking만 높여 overlay가 프로필 상세, navigation과 중앙 본문 위에 보이게 한다.

**Tech Stack:** React Native 0.85, React Native Web 0.21, Expo Router, React Relay, Storybook Vitest, Playwright, OpenSpec

## Global Constraints

- Authority는 `docs/design/breakpoints.md`, `docs/design/figma.md`, 최신 Linear `PROD-238`, `openspec/changes/add-responsive-profile-picker/`다.
- Web breakpoint는 `compact=768`, `full=1280`을 그대로 사용하고 새 breakpoint나 dependency를 추가하지 않는다.
- 닫힌 full profile summary는 기존 260px를 유지한다. picker는 프로필 이름 trigger 바로 아래의 absolute
  overlay로 열려 trigger 아래의 프로필 상세와 navigation 위에 paint되며 navigation의 layout 위치를 바꾸지 않는다.
- compact drawer는 80px rail 오른쪽의 비모달 absolute layer이며 backdrop·focus trap·layout width 변경이 없다.
- mobile Web drawer와 Android/iOS `Modal` picker 경로는 재설계하지 않는다.
- 프로필 목록만 internal scroll owner다. add action·create form·오류 footer는 목록과 함께 스크롤하지 않는다.
- 시각적 picker wrapper가 bounds·border·overflow를 소유한다. semantic `menu`는 profile option·separator·add action까지만 포함하고 create form·operation error alert은 같은 고정 footer 위치의 sibling으로 둔다.
- full·compact Web picker open 시 현재 선택 항목 또는 첫 항목으로 focus를 옮기고 `ArrowUp`·`ArrowDown`·`Home`·`End`를 지원한다. `Escape`는 닫고 trigger focus를 복원하며 `Tab`은 가로채지 않는다.
- full·compact Web의 선택·생성 실패는 picker와 오류를 유지하고 생성 실패는 입력값을 보존한다. trigger 재실행,
  full·compact 바깥 pointer close 또는 `Escape`의 명시적 close는 `open=false`, `creating=false`, 빈 handle과
  오류 없음으로 초기화한다. 바깥 pointer close는 pointer 대상의 기본 focus를 따르고, `Escape`는 trigger focus를
  복원한다. mobile Web drawer와 native의 기존 close state 동작은 유지한다.
- GraphQL fragment·mutation payload, Relay normalization, `resetActor`, route와 cache 정책을 바꾸지 않는다.
- active `add-shell-responsive-breakpoints`의 이전 compact popover delta는 이 변경에 흡수하거나 수정하지 않는다. 최종 active spec sync·archive 전에 최신 drawer 계약이 남는지 별도 확인한다.
- compact paint 검증에서 clipping 또는 sibling stacking 실패가 발견되면 portal을 추가하지 않고 작업을 중단해 범위 승인을 다시 받는다.
- Draft PR 생성·본문 갱신·Ready 전환은 target과 정확한 문안을 먼저 보여주고 각각 별도 승인을 받은 뒤 실행한다. checkpoint push 자체는 승인된 Git workflow 안에서 commit 직후 수행한다.

---

## File Ownership

- Modify `apps/app/src/components/shell/ProfileSwitcher.tsx`
  - `ProfileSwitcherSurface` 계약, trigger와 chevron, Web keyboard/outside-click lifecycle, bounded list와 fixed footer, transient reset을 소유한다.
- Modify `apps/app/src/components/shell/SidebarNavigation.tsx`
  - `full | compact | drawer` surface 전달, 260px full summary와 이름 trigger 기준 anchored absolute overlay를 소유한다.
- Modify `apps/app/src/components/shell/UniversalShell.tsx`
  - compact picker open 중 desktop sidebar sibling의 stacking만 소유한다. picker content나 breakpoint 숫자는 소유하지 않는다.
- Modify `apps/app/src/stories/Shell.stories.tsx`
  - 12개 typed profile fixture와 full·compact·keyboard·failure/reset의 최소 interaction 검증을 소유한다.
- Verify only `apps/web/e2e/profile-switcher.e2e.ts`
  - 기존 선택·생성 및 Relay actor environment 회귀를 실행한다. responsive DOM assertion을 이 파일에 추가하지 않는다.
- Verify only `apps/app/.storybook/preview.tsx`
  - 새 viewport preset을 추가하지 않는다. exact width는 browser resize로 확인한다.
- Keep aligned `docs/design/breakpoints.md`, `openspec/changes/add-responsive-profile-picker/{proposal.md,design.md,decisions.md,tasks.md,specs/web-app-shell/spec.md}`
  - 구현 중 새 제품 결정이 발견되면 제품 코드보다 먼저 이 계약을 갱신하고 사용자 승인을 다시 받는다.

## Interface Contract

`ProfileSwitcher`의 presentation 입력을 다음처럼 명시한다.

```tsx
export type ProfileSwitcherSurface = 'compact' | 'drawer' | 'full';

type CommonProps = {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  query: ProfileSwitcher_query$key;
  showAvatar?: boolean;
};

type Props = CommonProps &
  (
    | {
        renderSummary: (trigger: ReactNode) => ReactNode;
        surface: 'full';
      }
    | {
        renderSummary?: never;
        surface: 'compact' | 'drawer';
      }
  );
```

- `renderSummary(trigger)`는 `SidebarNavigation`이 full cover·avatar·profile detail과 trigger를 정확히 260px summary에 함께 넣는 render seam이다. `ProfileSwitcher`는 같은 root에서 이름 trigger bottom에 맞춘 absolute overlay를 anchor한다.
- `surface='compact'`만 avatar trigger와 Web absolute drawer를 사용한다.
- `surface='full'`은 `renderSummary`를 필수로 받고 Web picker를 이름 trigger 바로 아래의 absolute layer로 렌더한다.
- `surface='drawer'`인 mobile Web은 기존 absolute menu를, native platform은 기존 `Modal` 경로를 유지한다. 새 keyboard/reset lifecycle은 두 경로에 적용하지 않는다.

## State Contract

| 전이 | open | creating | handle | error | focus |
| --- | --- | --- | --- | --- | --- |
| Web open | true | false | 빈 값 | 없음 | 선택 항목 또는 첫 항목 |
| 선택 실패 | true | 기존값 | 기존값 | 선택 오류 | 현재 option |
| 생성 실패 | true | true | 입력 유지 | 생성 오류 | 입력 또는 실행 button |
| 선택 성공 | false | false | 빈 값 | 없음 | actor reset 이후 새 shell |
| full trigger close | false | false | 빈 값 | 없음 | trigger |
| compact trigger close | false | false | 빈 값 | 없음 | trigger |
| full outside pointer close | false | false | 빈 값 | 없음 | pointer 대상의 기본 focus |
| compact outside pointer close | false | false | 빈 값 | 없음 | pointer 대상의 기본 focus |
| Web `Escape` close | false | false | 빈 값 | 없음 | trigger |

## Test Code Scope

- **테스트 코드 범위:** `apps/app/src/stories/Shell.stories.tsx`의 기존 Shell Relay fixture와 interaction 영역만 수정한다.
- **테스트 필요성:** full flow/expanded toggle, compact overlay dismissal·stacking seam, 12개 목록의 internal scroll·keyboard focus, 실패 유지와 명시적 close reset을 관찰 가능한 결과로 직접 증명한다.
- **테스트 제외 범위:** 새 test harness/helper 파일, Storybook viewport preset, 광범위 snapshot, GraphQL/Relay cache 테스트 확대, `apps/web/e2e/profile-switcher.e2e.ts` 수정, Android/iOS picker 테스트, PROD-213/214/215 상태 조합.

## Spec Coverage

| OpenSpec contract | Implementation task | Proof |
| --- | --- | --- |
| full 260px summary, 이름 trigger 바로 아래 anchored overlay, navigation 위치 불변 | Task 6 | `ResponsiveProfilePickerFull` interaction과 1280/1440px 시각 검증 |
| compact avatar overlay와 네 dismissal 경로 | Task 2-3 | `ResponsiveProfilePickerCompact` interaction과 768/1024/1279px 시각 검증 |
| list-only scroll, fixed footer, create form shrink | Task 3 | 12개 typed fixture의 list/footer geometry assertion |
| selected-first focus, arrow/Home/End, visible focus, Escape restore | Task 3 | long-list keyboard interaction |
| failure 유지와 explicit close reset | Task 3 | 기존 select/create error stories의 유지·reset assertion |
| Relay actor 선택·생성 흐름 비변경 | Task 4 | 기존 `profile-switcher.e2e.ts` 전체 실행 |
| mobile/native 비재설계 | Task 1-3 | 명시적 `surface='drawer'`/platform guard와 독립 implementation review; 새 native test는 제외 |
| old popover delta와 최종 active spec 정렬 | Task 4 | archive 전 `rg` 및 active spec sync stop gate |

---

### Task 0: 승인된 계약을 안전한 작업 브랜치와 Draft PR에 고정

**Files:**

- Modify: `docs/design/breakpoints.md`
- Create: `docs/superpowers/plans/2026-07-26-responsive-profile-picker.md`
- Create: `openspec/changes/add-responsive-profile-picker/`

**Interfaces:**

- Consumes: 사용자에게 승인된 OpenSpec Gate와 이 최종 구현 계획
- Produces: `PROD-238` 작업 브랜치, 계획 checkpoint commit, 별도 승인 뒤 열리는 `main <- PROD-238` Draft PR

- [ ] **Step 1: base와 작업 변경을 확인한다**

Run:

```bash
git status --short --branch
git branch --show-current
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git branch --list PROD-238 prod-238
git branch -r --list origin/PROD-238 origin/prod-238
git check-ignore -v docs/superpowers/plans/2026-07-26-responsive-profile-picker.md
```

Expected: 현재 planning artifact 외 제품 코드 변경이 없고 `HEAD`와 `origin/main`이 같다. implementation plan은 저장소의 `/docs/superpowers/` ignore rule에 걸리므로 첫 planning checkpoint에서만 exact path를 `-f`로 추가한다. local 또는 fetched remote에 `PROD-238`/`prod-238`가 이미 있거나 두 revision이 다르면 새 브랜치를 만들거나 dirty worktree를 이동·rebase하지 않고 사용자에게 상태를 보고한 뒤 중단한다.

- [ ] **Step 2: 승인된 브랜치를 만든다**

Run:

```bash
git switch -c PROD-238
git status --short --branch
```

Expected: `PROD-238`에서 planning artifact만 변경 상태로 남는다.

- [ ] **Step 3: 계획 checkpoint를 검증한다**

Run:

```bash
pnpm exec prettier --check docs/design/breakpoints.md docs/superpowers/plans/2026-07-26-responsive-profile-picker.md openspec/changes/add-responsive-profile-picker
pnpm exec openspec validate add-responsive-profile-picker --strict
pnpm exec openspec validate --all --strict
git diff --check
```

Expected: formatting check, scoped/all strict validation과 diff check가 모두 exit code 0이다.

- [ ] **Step 4: planning artifact만 checkpoint commit하고 즉시 push한다**

Run:

```bash
git add docs/design/breakpoints.md openspec/changes/add-responsive-profile-picker
git add -f docs/superpowers/plans/2026-07-26-responsive-profile-picker.md
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "PROD-238 반응형 프로필 피커 계약과 계획을 정리한다"
git push -u origin PROD-238
```

Expected: 제품 코드 없이 계약·계획만 첫 commit에 포함되고 remote `PROD-238`와 동기화된다.

- [ ] **Step 5: Draft PR target과 문안을 보여주고 별도 승인을 받는다**

Target: `byulmaru/kosmo`, base `main`, head `PROD-238`, Draft

Title:

```text
웹 프로필 피커를 반응형으로 표시하고 긴 목록을 스크롤하게 한다
```

Initial body:

```md
## 무엇을 변경했는지

- PROD-238의 canonical breakpoint 계약과 OpenSpec change를 정리했습니다.
- full·compact overlay picker, 긴 목록 scroll과 keyboard 계약의 구현 계획을 추가했습니다.
- 제품 코드는 아직 변경하지 않았습니다.

## 왜 변경했는지

현재 profile picker는 breakpoint별 surface와 긴 목록의 scroll 경계가 없어 compact 본문을 가리거나 footer 접근성을 잃을 수 있습니다.

## 이번 PR의 주요 결정

- 닫힌 full profile summary는 260px를 유지하고 picker만 navigation 앞 flow에 참여합니다.
- compact는 80px rail 폭을 바꾸지 않는 비모달 absolute drawer를 사용합니다.
- Web menu keyboard model과 명시적 close reset 계약은 OpenSpec decisions를 적용합니다.

## 어떻게 확인할 수 있는지

- OpenSpec scoped/all strict validation 통과
- 구현, Storybook interaction, E2E와 exact-width 시각 검증은 아직 진행 전

## 아직 어떤 문제가 남았는지

- 제품 코드와 최소 회귀 테스트 구현
- 768·1024·1279·1280·1440px paint·scroll 확인
- 기존 profile-switcher E2E와 최종 독립 구현 리뷰
```

Expected: 사용자가 target·title·body·Draft 상태를 승인한 뒤에만 `gh pr create --draft --base main --head PROD-238`를 실행한다.

---

### Task 1: Full sidebar의 초기 inline picker flow — Task 5에서 superseded

> 2026-07-27 시각 확인 뒤 최신 `PROD-238` 계약이 full picker를 navigation 위치를 바꾸지 않는 anchored
> absolute overlay로 교정했다. 아래 단계는 최초 구현의 TDD·commit 기록으로만 보존하며, 현재 목표 동작과
> 실행 지침은 Task 5가 소유한다.

**Files:**

- Modify: `apps/app/src/stories/Shell.stories.tsx:114-120,438-468,870-895`
- Modify: `apps/app/src/components/shell/ProfileSwitcher.tsx:64-350`
- Modify: `apps/app/src/components/shell/SidebarNavigation.tsx:69-167,345-378`

**Interfaces:**

- Consumes: `ProfileSwitcherSurface`, controlled `open`, `onOpenChange`, full `renderSummary(trigger)` seam
- Produces: 닫힌 260px profile summary, 같은 name trigger의 toggle/expanded/up-down chevron, navigation 앞의 inline picker flow

- [ ] **Step 1: full surface의 실패하는 Storybook interaction을 작성한다**

`ProfileSwitcherStory`가 `surface="full"`을 명시하게 하고 `ResponsiveProfilePickerFull` story를 새로 만들어 navigation 위치와 trigger state를 관찰한다. 기존 `UniversalFull` story의 sticky rail 검증은 수정하지 않는다.

```tsx
const trigger = canvas.getByRole('button', { name: '프로필 목록' });
const summary = canvas.getByLabelText('활성 프로필');
const navigation = canvas.getByRole('navigation', { name: '주요 메뉴' });
const summaryBottom = summary.getBoundingClientRect().bottom;
const closedNavigationTop = navigation.getBoundingClientRect().top;

expect(trigger).toHaveAttribute('aria-expanded', 'false');
await userEvent.click(trigger);
expect(trigger).toHaveAttribute('aria-expanded', 'true');
const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
expect(menu).toBeVisible();
expect(menu.getBoundingClientRect().top).toBeGreaterThanOrEqual(summaryBottom);
expect(navigation.getBoundingClientRect().top).toBeGreaterThan(closedNavigationTop);

await userEvent.click(trigger);
expect(trigger).toHaveAttribute('aria-expanded', 'false');
expect(canvas.queryByRole('menu', { name: '프로필 전환' })).toBeNull();
```

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: 현재 absolute menu는 navigation 위치를 바꾸지 않아 full flow assertion이 FAIL한다.

- [ ] **Step 3: surface와 summary render seam을 구현한다**

`ProfileSwitcher.tsx`에 명시적 surface와 discriminated `renderSummary` prop을 추가한다. 기존 root의 compact/full style과 open z-index를 보존하고, full에서만 fixed summary와 inline picker를 실제 flow siblings로 렌더한다.

```tsx
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ProfileSwitcherSurface = 'compact' | 'drawer' | 'full';

type CommonProps = {
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  query: ProfileSwitcher_query$key;
  showAvatar?: boolean;
};

type Props = CommonProps &
  (
    | { renderSummary: (trigger: ReactNode) => ReactNode; surface: 'full' }
    | { renderSummary?: never; surface: 'compact' | 'drawer' }
  );

const compact = surface === 'compact';
const fullWeb = Platform.OS === 'web' && surface === 'full';
const controlRef = useRef<View>(null);
const menuRef = useRef<View>(null);
const triggerRef = useRef<View>(null);

const trigger = (
  <Pressable
    aria-expanded={open}
    accessibilityLabel="프로필 목록"
    accessibilityRole="button"
    accessibilityState={{ expanded: open }}
    onPress={() => setOpen(!open)}
    ref={triggerRef}
    style={({ pressed }) => [
      styles.trigger,
      compact ? styles.compactTrigger : styles.fullTrigger,
      { opacity: pressed ? 0.65 : 1 },
    ]}
  >
    {showAvatar ? <Avatar label={active?.displayName ?? '?'} size={compact ? 40 : 48} /> : null}
    {!compact ? (
      <Text numberOfLines={1} style={[styles.triggerName, { color: theme.text }]}>
        {active?.displayName ?? (profiles.length ? '프로필 선택' : '프로필')}
      </Text>
    ) : null}
    {!compact ? (
      fullWeb && open ? (
        <ChevronUpIcon color={theme.textSecondary} size={16} />
      ) : (
        <ChevronDownIcon color={theme.textSecondary} size={16} />
      )
    ) : null}
  </Pressable>
);

const triggerSurface = surface === 'full' ? renderSummary(trigger) : trigger;

return (
  <View
    ref={controlRef}
    style={[
      styles.root,
      compact ? styles.compactRoot : styles.fullRoot,
      { zIndex: open ? 30 : 0 },
    ]}
  >
    {triggerSurface}
    {Platform.OS === 'web' ? (
      open ? (
        fullWeb ? (
          <View style={styles.fullInlineMenu}>{menu}</View>
        ) : (
          <View
            style={[
              styles.webMenu,
              surface === 'compact' ? styles.compactMenuPosition : styles.fullMenuPosition,
            ]}
          >
            {menu}
          </View>
        )
      ) : null
    ) : (
      <Modal
        accessibilityLabel="프로필 전환"
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        role="dialog"
        transparent
        visible={open}
      >
        <Pressable onPress={() => setOpen(false)} style={styles.backdrop}>
          <Pressable
            accessibilityLabel="프로필 전환"
            accessibilityViewIsModal
            onPress={(event) => event.stopPropagation()}
            style={styles.nativeMenu}
          >
            {menu}
          </Pressable>
        </Pressable>
      </Modal>
    )}
  </View>
);
```

`ProfileSwitcherStory`처럼 component만 격리하는 full story는 `renderSummary={(trigger) => trigger}`를 명시한다. 실제 shell에서는 `SidebarNavigation.tsx`가 기존 260px `profileHeader`를 그대로 반환하는 seam을 제공한다.

```tsx
import type { ReactNode } from 'react';

const profileCountLinks = profile ? (
  <>
    <Link asChild href={`/${profile.relativeHandle}/following`}>
      <Pressable accessibilityRole="link" style={styles.countLink}>
        <Text style={[styles.count, { color: theme.text }]}>
          {countFormatter.format(profile.followingCount).toLowerCase()}
        </Text>
        <Text style={[styles.countLabel, { color: theme.text }]}>팔로잉</Text>
      </Pressable>
    </Link>
    <Link asChild href={`/${profile.relativeHandle}/followers`}>
      <Pressable accessibilityRole="link" style={styles.countLink}>
        <Text style={[styles.count, { color: theme.text }]}>
          {countFormatter.format(profile.followersCount).toLowerCase()}
        </Text>
        <Text style={[styles.countLabel, { color: theme.text }]}>팔로워</Text>
      </Pressable>
    </Link>
  </>
) : null;

const profileDetails = profile ? (
  <>
    <Text
      accessibilityLabel="활성 프로필 핸들"
      numberOfLines={1}
      style={[styles.profileHandle, { color: theme.textSecondary }]}
    >
      {profile.relativeHandle}
    </Text>
    <View style={styles.counts}>{profileCountLinks}</View>
  </>
) : (
  <Text style={[styles.emptyProfile, { color: theme.textSecondary }]}>
    {hasProfiles ? '사용할 프로필을 선택해주세요.' : '새 프로필을 만들어 시작하세요.'}
  </Text>
);

const renderProfileSummary = (trigger: ReactNode) => (
  <View accessibilityLabel="활성 프로필" style={styles.profileHeader}>
    <View style={[styles.cover, { backgroundColor: theme.surface }, Platform.OS === 'web' && webCover]} />
    <View style={styles.largeAvatar}>
      <Avatar label={profile?.displayName || profile?.handle || '?'} size={96} style={avatarShadow} />
    </View>
    {profile ? (
      <Pressable
        accessibilityLabel="프로필 편집"
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        style={[styles.editButton, { backgroundColor: theme.primary }]}
      >
        <Text style={styles.editLabel}>편집</Text>
      </Pressable>
    ) : null}
    <View style={styles.profileCopy}>
      {trigger}
      {profileDetails}
    </View>
  </View>
);

const profileSwitcher = compact ? (
  <ProfileSwitcher
    onOpenChange={onSwitcherOpenChange}
    open={switcherOpen}
    query={data}
    showAvatar
    surface="compact"
  />
) : surface === 'desktop' ? (
  <ProfileSwitcher
    onOpenChange={onSwitcherOpenChange}
    open={switcherOpen}
    query={data}
    renderSummary={renderProfileSummary}
    showAvatar={false}
    surface="full"
  />
) : (
  renderProfileSummary(
    <ProfileSwitcher
      onOpenChange={onSwitcherOpenChange}
      open={switcherOpen}
      query={data}
      showAvatar={false}
      surface="drawer"
    />,
  )
);
```

`profileHeader: { height: 260, position: 'relative', width: 320, zIndex: 20 }`와 `profileCopy`의 absolute `top: 140` style은 full과 drawer 모두 그대로 유지한다. `fullInlineMenu`만 260px summary 다음의 normal-flow block이며 navigation `ScrollView`는 `profileSwitcher` 다음 sibling으로 남는다.

- [ ] **Step 4: GREEN과 닫힌 full sidebar 회귀를 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
pnpm --filter @kosmo/app check
```

Expected: full toggle/flow assertion이 PASS하고 닫힌 header의 avatar·edit·handle·count와 navigation이 기존 위치 범위에 남는다.

- [ ] **Step 5: checkpoint commit과 push 후 Draft PR body를 갱신한다**

Run:

```bash
git add apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/components/shell/SidebarNavigation.tsx apps/app/src/stories/Shell.stories.tsx
git diff --cached --check
git diff --cached
git commit -m "PROD-238 full 프로필 피커를 inline flow로 배치한다"
git push origin PROD-238
```

Expected: full surface와 직접 증명하는 Storybook 변경만 checkpoint에 포함된다. Draft PR body의 완료·미완료·검증 상태 변경 문안을 보여주고 별도 승인을 받은 뒤에만 갱신한다.

---

### Task 2: Compact avatar drawer의 overlay와 dismissal lifecycle

**Files:**

- Modify: `apps/app/src/stories/Shell.stories.tsx:860-869`
- Modify: `apps/app/src/components/shell/ProfileSwitcher.tsx:80-350`
- Modify: `apps/app/src/components/shell/UniversalShell.tsx:146-160,262-268`

**Interfaces:**

- Consumes: Task 1의 `surface='compact'`, controlled `switcherOpen`, trigger/menu refs
- Produces: rail 오른쪽 absolute drawer, open sidebar stacking, trigger/outside/`Escape`/선택 성공 dismissal

- [ ] **Step 1: compact surface의 실패하는 Storybook interaction을 작성한다**

```tsx
const trigger = canvas.getByRole('button', { name: '프로필 목록' });
const route = canvas.getByText('홈 타임라인');

await userEvent.click(trigger);
const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
expect(menu).toBeVisible();
expect(menu.getBoundingClientRect().left).toBeGreaterThanOrEqual(80);

await userEvent.click(route);
expect(canvas.queryByRole('menu', { name: '프로필 전환' })).toBeNull();

await userEvent.click(trigger);
await userEvent.keyboard('{Escape}');
expect(canvas.queryByRole('menu', { name: '프로필 전환' })).toBeNull();
expect(trigger).toHaveFocus();
```

이 interaction은 새 `ResponsiveProfilePickerCompact` story에 두고 기존 `UniversalCompact`를 수정하지 않는다. 같은 story에서 trigger를 다시 실행해 닫히는 경우도 한 번만 검증한다. backdrop/dialog/focus trap assertion은 `queryByRole('dialog') === null`로 유지한다.

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: 현재 compact menu의 left edge와 outside/`Escape` dismissal assertion이 FAIL한다.

- [ ] **Step 3: compact Web lifecycle과 shell stacking을 구현한다**

`ProfileSwitcher.tsx`는 기존 `PostComposer` menu pattern처럼 open 동안만 listener를 등록한다.

```tsx
useEffect(() => {
  if (Platform.OS !== 'web' || !open || surface === 'drawer') return;

  const control = controlRef.current as unknown as HTMLElement | null;
  const trigger = triggerRef.current as unknown as HTMLElement | null;

  const onPointerDown = (event: PointerEvent) => {
    if (surface === 'compact' && !control?.contains(event.target as Node)) {
      setOpen(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setOpen(false);
    trigger?.focus();
  };

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('keydown', onKeyDown);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  };
}, [open, surface]);
```

trigger와 drawer를 같은 `controlRef` root 안에 두어 trigger pointerdown이 outside close로 처리되지 않게 한다. compact menu의 left offset은 44px trigger의 rail 내 실제 위치를 기준으로 최종 left edge가 80px가 되도록 계산하고, drawer width는 기존 full picker 폭을 유지한다.

`UniversalShell.tsx`는 compact open일 때 sidebar sibling의 stacking만 높인다.

```tsx
<View
  style={[
    styles.sidebar,
    web && webStickyRail,
    compact && switcherOpen && styles.sidebarWithOverlay,
    { borderColor: theme.border, width: full ? 320 : 80 },
  ]}
>
```

```tsx
sidebarWithOverlay: { zIndex: 30 },
```

- [ ] **Step 4: interaction GREEN과 early paint stop gate를 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app storybook:dev
```

Open: `http://localhost:6006/?path=/story/kosmo-shell-navigation--responsive-profile-picker-compact`

Browser width를 768px, 1024px, 1279px로 조절해 drawer left edge가 80px rail 오른쪽이고 center width가 open 전후 같으며 drawer가 route 위에 paint되는지 확인한다. clipping 또는 stacking 실패가 하나라도 있으면 이 Task에서 중단하고 portal/layer host 범위를 사용자에게 다시 제시한다.

- [ ] **Step 5: checkpoint commit과 push 후 Draft PR body를 갱신한다**

Run:

```bash
git add apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/components/shell/UniversalShell.tsx apps/app/src/stories/Shell.stories.tsx
git diff --cached --check
git diff --cached
git commit -m "PROD-238 compact 프로필 피커를 overlay drawer로 연다"
git push origin PROD-238
```

Expected: compact surface, dismissal, stacking과 직접 증명하는 story만 checkpoint에 포함된다. exact-width 관찰 결과와 portal stop gate 통과 여부의 본문 변경 문안을 보여주고 별도 승인을 받은 뒤에만 Draft PR에 기록한다.

---

### Task 3: 긴 목록 scroll, keyboard menu model과 transient reset

**Files:**

- Modify: `apps/app/src/stories/Shell.stories.tsx:21-52,438-521`
- Modify: `apps/app/src/components/shell/ProfileSwitcher.tsx:1-350`

**Interfaces:**

- Consumes: Task 1/2의 surface, `menuitemradio` profile options, existing select/create mutations
- Produces: 12개 typed fixture, list-only `ScrollView`, fixed footer, selected-first focus와 arrow navigation, failure/reset state matrix

- [ ] **Step 1: 12개 typed fixture와 실패하는 long-list interaction을 작성한다**

기존 `profile()` fixture builder를 그대로 사용한다.

```tsx
const additionalProfiles = Array.from({ length: 11 }, (_, index) =>
  profile({
    displayName: `테스트 프로필 ${index + 1}`,
    handle: `picker_${index + 1}`,
    id: `profile-picker-${index + 1}`,
    relativeHandle: `@picker_${index + 1}`,
    viewerState: { follow: null, followRequest: null, isSelf: true },
  }),
);

const longProfileQuery = {
  ...query,
  ...shellQuery({ profiles: [selectedProfile, ...additionalProfiles], selectedProfile }),
};
```

`ResponsiveProfilePickerCompact`의 Relay data를 `longProfileQuery`로 교체하고 첫 additional profile의 성공 mutation response를 제공한다.

```tsx
parameters: {
  ...universalParameters,
  relay: {
    data: longProfileQuery,
    mutationResponse: {
      selectProfile: {
        profile: additionalProfiles[0]!,
        session: {
          id: 'session-story',
          selectedProfile: { id: additionalProfiles[0]!.id },
        },
      },
    },
  },
},
```

interaction은 네 keyboard key와 compact 선택 성공 dismissal을 모두 검증한다. `waitFor`는 기존 `storybook/test` import에 추가한다.

```tsx
await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
const list = canvas.getByLabelText('전환할 프로필 목록');
const options = within(menu).getAllByRole('menuitemradio');
const footerAction = canvas.getByRole('menuitem', { name: '새 프로필 추가' });

expect(options).toHaveLength(12);
expect(options[0]).toHaveFocus();
expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
expect(footerAction).toBeVisible();

await userEvent.keyboard('{ArrowDown}');
expect(options[1]).toHaveFocus();
await userEvent.keyboard('{ArrowUp}');
expect(options[0]).toHaveFocus();
await userEvent.keyboard('{End}');
expect(options[11]).toHaveFocus();
const menuRect = list.getBoundingClientRect();
const focusedRect = options[11]!.getBoundingClientRect();
expect(focusedRect.top).toBeGreaterThanOrEqual(menuRect.top);
expect(focusedRect.bottom).toBeLessThanOrEqual(menuRect.bottom);

await userEvent.keyboard('{Home}');
expect(options[0]).toHaveFocus();
const firstRect = options[0]!.getBoundingClientRect();
expect(firstRect.top).toBeGreaterThanOrEqual(menuRect.top);
expect(firstRect.bottom).toBeLessThanOrEqual(menuRect.bottom);

await userEvent.click(options[1]!);
await waitFor(() => expect(canvas.queryByRole('menu', { name: '프로필 전환' })).toBeNull());
```

기존 `ProfileSwitcherCreateGraphQLError`에는 실패 input 보존 뒤 explicit close/reopen reset을 추가한다.

```tsx
expect(input).toHaveValue('kept_handle');
await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
await userEvent.click(canvas.getByRole('button', { name: '프로필 목록' }));
expect(canvas.queryByRole('alert')).toBeNull();
await userEvent.click(canvas.getByRole('button', { name: '새 프로필 추가' }));
expect(canvas.getByRole('textbox', { name: '프로필 핸들' })).toHaveValue('');
```

- [ ] **Step 2: RED를 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: 현재 list에는 internal scroll이 없고 open 시 option focus가 이동하지 않으며 explicit close 뒤 handle이 남아 FAIL한다.

- [ ] **Step 3: list-only ScrollView와 fixed footer를 구현한다**

`ProfileSwitcher.tsx`의 profile options만 `ScrollView`로 감싸고 divider/add/create/error는 scroll container 밖에 둔다. 시각적 picker wrapper가 bounds·border·overflow를 소유하고, 내부 semantic `menu` region은 profile options·divider·add action만 포함한다. create form과 operation error alert은 같은 고정 footer 위치를 유지하는 `menu` sibling으로 분리해 ARIA `aria-required-children` 규칙을 지킨다. 기존 E2E의 `menu`와 add `menuitem` selector는 유지한다.

```tsx
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';

const webCompactPickerBounds = {
  maxHeight: 'min(560px, calc(100vh - 32px))',
} as unknown as ViewStyle;
const webFullPickerBounds = {
  maxHeight: 'min(560px, calc(100vh - 276px))',
} as unknown as ViewStyle;

const addProfileButton = !creating ? (
  <Pressable
    accessibilityLabel="새 프로필 추가"
    disabled={busy}
    onPress={() => {
      setCreating(true);
      setError(null);
    }}
    role={Platform.OS === 'web' ? 'menuitem' : 'button'}
    style={({ pressed }) => [
      styles.addProfile,
      {
        backgroundColor: pressed ? theme.surface : 'transparent',
        opacity: busy ? 0.5 : 1,
      },
    ]}
  >
    <View style={styles.addIcon}>
      <PlusIcon color={theme.text} size={18} strokeWidth={2.25} />
    </View>
    <Text style={[styles.addLabel, { color: theme.text }]}>새 프로필 추가</Text>
  </Pressable>
) : null;

const createForm = creating ? (
  <View
    accessibilityLabel="새 프로필 만들기"
    role={Platform.OS === 'web' ? 'form' : undefined}
    style={styles.createForm}
  >
    <View style={styles.createRow}>
      <TextInput
        aria-invalid={Boolean(error)}
        accessibilityLabel="프로필 핸들"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        onChangeText={setHandle}
        onSubmitEditing={createProfile}
        placeholder="새 프로필 핸들"
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.card,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
          },
        ]}
        value={handle}
      />
      <Button disabled={busy} loading={busy} onPress={createProfile} style={styles.createButton}>
        만들기
      </Button>
    </View>
    <Text style={[styles.help, { color: theme.textSecondary }]}>
      영문, 숫자, 밑줄(_)만 사용할 수 있어요.
    </Text>
    {error ? (
      <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
        {error}
      </Text>
    ) : null}
  </View>
) : null;

const surfaceBounds =
  Platform.OS !== 'web' || surface === 'drawer'
    ? undefined
    : surface === 'compact'
      ? webCompactPickerBounds
      : webFullPickerBounds;

<View
  style={[styles.menu, surfaceBounds, { backgroundColor: theme.card, borderColor: theme.border }]}
>
  <View
    accessibilityLabel="프로필 전환"
    accessibilityRole={Platform.OS === 'web' ? undefined : 'menu'}
    ref={menuRef}
    role={Platform.OS === 'web' ? 'menu' : undefined}
    style={styles.menuRegion}
  >
    <ScrollView
      accessibilityLabel="전환할 프로필 목록"
      contentContainerStyle={styles.profileListContent}
      role={Platform.OS === 'web' ? 'group' : undefined}
      style={styles.profileList}
    >
    {profiles.map((profile, index) => {
      const selected = active?.id === profile.id;
      return (
        <Pressable
          aria-checked={selected}
          accessibilityRole={Platform.OS === 'web' ? undefined : 'radio'}
          accessibilityState={{ checked: selected, disabled: busy }}
          disabled={busy}
          key={profile.id}
          onPress={() => selectProfile(profile.id)}
          role={Platform.OS === 'web' ? ('menuitemradio' as 'radio') : undefined}
          tabIndex={
            Platform.OS === 'web' && (selected || (!active && index === 0)) ? 0 : -1
          }
          style={({ pressed }) => [
            styles.profile,
            {
              backgroundColor: selected || pressed ? theme.surface : 'transparent',
              opacity: busy ? 0.5 : 1,
            },
          ]}
        >
          <Avatar label={profile.displayName} size={selected ? 48 : 32} />
          <View style={styles.profileLabel}>
            <Text numberOfLines={1} style={[styles.profileName, { color: theme.text }]}>
              {profile.displayName}
            </Text>
            <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
              {profile.relativeHandle}
            </Text>
          </View>
          {selected ? <CheckIcon color={theme.text} size={16} /> : null}
        </Pressable>
      );
    })}
    </ScrollView>
    <View role={Platform.OS === 'web' ? 'separator' : undefined} style={styles.divider} />
    {addProfileButton}
  </View>
  <View style={styles.pickerFooter}>
    {createForm}
    {!creating && error ? (
      <Text accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>
        {error}
      </Text>
    ) : null}
  </View>
</View>
```

`webCompactPickerBounds`와 `webFullPickerBounds`는 각각 현재 surface 위치에서 viewport gap을 남기면서 12개 fixture가 list scroll을 만드는 CSS `maxHeight` Web style이다. 시각적 `menu` wrapper에는 `overflow: 'hidden'`, semantic `menuRegion`과 `profileList`에는 축소 가능한 flex 경계, `profileList`에는 `minHeight: 0`을 적용한다. footer에는 scroll style이나 `menu` role을 적용하지 않고 새 breakpoint 상수는 만들지 않는다.

- [ ] **Step 4: keyboard focus 이동과 reset을 구현한다**

open effect에서 현재 `PostComposer`의 DOM menu pattern을 좁게 재사용한다.

```tsx
const menu = menuRef.current as unknown as HTMLElement | null;
const items = Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);
const initialItem =
  items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0];

initialItem?.focus();
initialItem?.scrollIntoView({ block: 'nearest' });

const moveFocus = (event: KeyboardEvent) => {
  const current = document.activeElement as HTMLElement | null;
  const index = current ? items.indexOf(current) : -1;
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || index < 0) return;

  event.preventDefault();
  const nextIndex =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : event.key === 'ArrowDown'
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
  items[nextIndex]?.focus();
  items[nextIndex]?.scrollIntoView({ block: 'nearest' });
};
```

각 full·compact Web option은 선택 항목, 선택값이 없으면 첫 항목만 roving entry가 되게 하고 native에는 기존 radio semantics를 유지한다. close effect는 redesigned Web surface에서만 handle까지 초기화한다.

```tsx
useEffect(() => {
  if (!open) {
    setCreating(false);
    if (Platform.OS === 'web' && surface !== 'drawer') {
      setHandle('');
    }
    setError(null);
  }
}, [open, surface]);
```

- [ ] **Step 5: GREEN과 기존 failure interaction을 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app build-storybook
```

Expected: long-list, keyboard, select/create failure와 close reset interaction이 PASS하고 Storybook static build가 성공한다.

- [ ] **Step 6: checkpoint commit과 push 후 Draft PR body를 갱신한다**

Run:

```bash
git add apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/stories/Shell.stories.tsx
git diff --cached --check
git diff --cached
git commit -m "PROD-238 긴 프로필 목록과 keyboard 탐색을 보장한다"
git push origin PROD-238
```

Expected: bounded content, keyboard와 상태 회귀의 최소 코드·test만 checkpoint에 포함된다. Storybook test/build 결과와 남은 E2E·시각 검증의 본문 변경 문안을 보여주고 별도 승인을 받은 뒤에만 Draft PR에 반영한다.

---

### Task 4: 통합 검증, 독립 구현 리뷰와 PR readiness gate

**Files:**

- Verify: `apps/app/src/components/shell/ProfileSwitcher.tsx`
- Verify: `apps/app/src/components/shell/SidebarNavigation.tsx`
- Verify: `apps/app/src/components/shell/UniversalShell.tsx`
- Verify: `apps/app/src/stories/Shell.stories.tsx`
- Verify only: `apps/web/e2e/profile-switcher.e2e.ts`
- Update progress: `openspec/changes/add-responsive-profile-picker/tasks.md`

**Interfaces:**

- Consumes: Task 1-3의 pushed checkpoints
- Produces: 자동·수동 검증 기록, 독립 implementation review packet, 사용자에게 제시할 Ready/남은 위험 상태

- [ ] **Step 1: focused 자동 검증을 실행한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app build-storybook
node scripts/test-db.mjs run -- pnpm test:e2e:database -- profile-switcher.e2e.ts
pnpm exec openspec validate add-responsive-profile-picker --strict
pnpm exec openspec validate --all --strict
pnpm exec prettier --check docs/design/breakpoints.md docs/superpowers/plans/2026-07-26-responsive-profile-picker.md openspec/changes/add-responsive-profile-picker apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/components/shell/SidebarNavigation.tsx apps/app/src/components/shell/UniversalShell.tsx apps/app/src/stories/Shell.stories.tsx
git diff --check
```

Expected: 모든 명령이 exit code 0이다. E2E가 환경 문제로 실행되지 않으면 product pass로 간주하지 않고 정확한 blocker와 미검증 상태를 Draft PR에 남긴다.

- [ ] **Step 2: exact-width 시각 검증을 기록한다**

Run:

```bash
pnpm --filter @kosmo/app storybook:dev
```

Review links:

- `http://localhost:6006/?path=/story/kosmo-shell-navigation--responsive-profile-picker-compact`
- `http://localhost:6006/?path=/story/kosmo-shell-navigation--responsive-profile-picker-full`

| Width | Expected surface | 필수 관찰 |
| --- | --- | --- |
| 768px | compact | avatar drawer가 80px rail 오른쪽, route 위, center width 불변 |
| 1024px | compact | 긴 목록만 scroll, footer 고정, outside wheel은 document scroll |
| 1279px | compact | full 전환 직전까지 drawer와 rail 폭 유지 |
| 1280px | full | 프로필 이름 trigger 바로 아래 overlay, navigation 위치와 center/right rail 폭 불변 |
| 1440px | full | overlay paint order, outside dismissal, 긴 목록 focus·footer, 닫힌 sidebar 회귀 없음 |

Expected: 각 width의 open/closed screenshot 또는 동일 수준의 관찰 기록과 결과를 Draft PR `어떻게 확인할 수 있는지`에 남긴다.

- [ ] **Step 3: active OpenSpec 충돌 stop gate를 확인한다**

Run:

```bash
rg -n "popover|overlay drawer|프로필 스위처" openspec/changes/add-shell-responsive-breakpoints openspec/changes/add-responsive-profile-picker openspec/specs/web-app-shell/spec.md
```

Expected: 구현 authority는 PROD-238 drawer 계약으로 명확하다. 기존 change를 수정하지 않은 채 최종 active spec sync 시 이전 popover 문구를 제거해야 한다는 archive 조건이 tasks와 Draft PR remaining risk에 남는다.

- [ ] **Step 4: Terra implementation reviewer에게 승인 범위 diff를 독립 리뷰시킨다**

리뷰 범위는 Task 1-3 제품·Storybook diff와 OpenSpec alignment다. reviewer는 GraphQL/Relay actor flow 비변경, mobile/native leakage, full 260px flow, compact stacking/listener race, keyboard semantics, reset matrix와 테스트 증거를 `REVIEW_PACKET_V1`으로 반환해야 한다. finding 수정은 새 checkpoint로 commit·push하고 focused 검증을 다시 실행한다.

- [ ] **Step 5: 최종 tasks와 Draft PR body를 갱신해 checkpoint한다**

검증된 checkbox만 `openspec/changes/add-responsive-profile-picker/tasks.md`에서 완료한다.

Run:

```bash
git add openspec/changes/add-responsive-profile-picker/tasks.md
git diff --cached --check
git diff --cached
git commit -m "PROD-238 프로필 피커 검증 결과를 기록한다"
git push origin PROD-238
git status --short --branch
```

Expected: 검증 기록 checkpoint가 remote와 동기화되고 의도하지 않은 working tree 변경이 없다. 현재 scope, 완료/미완료, 모든 검증 결과, active-change sync 위험과 review finding 상태를 담은 최종 본문을 보여주고 별도 승인을 받은 뒤에만 Draft PR을 갱신한다.

- [ ] **Step 6: Ready와 OpenSpec archive를 별도 gate로 유지한다**

PR scoped implementation과 필수 검증이 완료되면 Ready 대상·검증·남은 위험을 사용자에게 보여주고 상태 변경 승인을 받는다. OpenSpec archive는 PR Ready/merge와 별개이며, PROD-238 전체 scope, active spec sync, 모든 tasks와 검증이 완료된 뒤 별도로 판단한다.

---

### Task 5: Full picker를 navigation 위치를 보존하는 overlay로 교정

> Task 5의 `top: 260` 세로 앵커는 navigation 밀림을 해결한 당시 checkpoint다. 최신 사용자·canonical·Linear
> 계약에 따른 이름 trigger 하단 배치는 Task 6이 supersede한다.

**Files:**

- Modify: `apps/app/src/components/shell/ProfileSwitcher.tsx:155-205,441-521`
- Modify: `apps/app/src/components/shell/UniversalShell.tsx:146-161`
- Test: `apps/app/src/stories/Shell.stories.tsx:194-225`
- Verify only: `apps/web/e2e/profile-switcher.e2e.ts`
- Update progress: `openspec/changes/add-responsive-profile-picker/tasks.md`

**Interfaces:**

- Consumes: `surface='full'`, `renderSummary(trigger)`, 기존 semantic menu/list/footer와 controlled open state
- Produces: 260px summary 아래 anchored absolute overlay, navigation 위치 불변, full·compact outside dismissal,
  full·compact open-state sidebar stacking

**테스트 코드 범위:** `ResponsiveProfilePickerFull` interaction의 geometry와 outside dismissal assertion만 수정한다.

**테스트 필요성:** flow wrapper가 다시 들어오거나 full outside listener가 빠지면 사용자가 관찰한 navigation 밀림과
닫힘 회귀가 재발하므로, open 전후 navigation top과 바깥 interaction 뒤 menu 제거를 직접 검증한다.

**테스트 제외 범위:** 새 Storybook story/helper/harness, E2E geometry 확대, compact 중복 조합, GraphQL·Relay·native
테스트 추가.

- [ ] **Step 1: navigation 위치 불변 RED를 작성한다**

`ResponsiveProfilePickerFull`에서 기존 navigation 하강 assertion을 다음 관찰 가능한 결과로 바꾼다.

```tsx
const closedNavigationTop = navigation.getBoundingClientRect().top;

await userEvent.click(trigger);
const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
const menuRect = menu.getBoundingClientRect();
const openNavigationTop = navigation.getBoundingClientRect().top;

expect(menuRect.top).toBeGreaterThanOrEqual(summary.getBoundingClientRect().bottom);
expect(openNavigationTop).toBe(closedNavigationTop);
expect(menuRect.bottom).toBeGreaterThan(openNavigationTop);
expect(canvas.queryByRole('dialog')).toBeNull();
```

- [ ] **Step 2: RED가 현재 inline flow를 잡는지 확인한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: `ResponsiveProfilePickerFull`이 open navigation top이 closed top보다 picker 높이만큼 커서 FAIL한다.

- [ ] **Step 3: full picker를 absolute overlay로 최소 변경한다**

`ProfileSwitcher`의 full Web render를 기존 absolute wrapper와 별도의 full anchor style로 바꾼다.

```tsx
fullWeb ? (
  <View style={[styles.webMenu, styles.fullOverlayPosition]}>{menu}</View>
) : (
  <View
    style={[
      styles.webMenu,
      surface === 'compact' ? styles.compactMenuPosition : styles.fullMenuPosition,
    ]}
  >
    {menu}
  </View>
)
```

```tsx
fullOverlayPosition: { left: 0, top: 260 },
```

`UniversalShell`은 desktop full·compact open 모두 sidebar stacking을 높이되 width 계산은 그대로 둔다.

```tsx
switcherOpen && styles.sidebarWithOverlay,
```

- [ ] **Step 4: full outside dismissal RED를 작성하고 확인한다**

같은 full story에서 menu를 연 뒤 navigation link를 pointer target으로 실행한다.

```tsx
await userEvent.click(canvas.getByRole('link', { name: '홈' }));
expect(canvas.queryByRole('menu', { name: '프로필 전환' })).toBeNull();
```

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: full pointerdown은 현재 close하지 않으므로 menu가 남아 FAIL한다.

- [ ] **Step 5: full·compact 공통 outside containment로 GREEN을 만든다**

Web full·compact에만 이미 등록되는 document listener에서 surface 제한을 제거하고 control containment를 유지한다.

```tsx
const onPointerDown = (event: PointerEvent) => {
  if (!control?.contains(event.target as Node)) {
    setOpen(false);
  }
};
```

effect의 `surface === 'drawer'` guard, trigger/menu containment, `Escape` focus 복원, native Modal 경로는 바꾸지 않는다.

- [ ] **Step 6: focused GREEN과 통합 검증을 실행한다**

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app build-storybook
node scripts/test-db.mjs run -- pnpm test:e2e:database -- profile-switcher.e2e.ts
pnpm exec openspec validate add-responsive-profile-picker --strict
pnpm exec openspec validate --all --strict
pnpm exec prettier --check docs/design/breakpoints.md docs/superpowers/plans/2026-07-26-responsive-profile-picker.md openspec/changes/add-responsive-profile-picker apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/components/shell/UniversalShell.tsx apps/app/src/stories/Shell.stories.tsx
git diff --check
```

Expected: 모든 자동 검증이 exit code 0이고 compact/mobile/native·Relay 관련 diff가 없다.

- [ ] **Step 7: 1280·1440px 시각 stop gate를 확인한다**

현재 실행 중인 `ResponsiveProfilePickerFull`과 `UniversalFull` story에서 open 전후 navigation top, sidebar·center·right
rail 폭, overlay paint order와 clipping, 장목록 End focus·고정 footer, outside dismissal을 확인한다. clipping 또는
center sibling 뒤 paint가 확인되면 portal로 확대하지 않고 중단한다.

- [ ] **Step 8: checkpoint commit·push와 독립 구현 리뷰를 수행한다**

Run:

```bash
git add docs/design/breakpoints.md docs/superpowers/plans/2026-07-26-responsive-profile-picker.md openspec/changes/add-responsive-profile-picker apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/components/shell/UniversalShell.tsx apps/app/src/stories/Shell.stories.tsx
git diff --cached --check
git diff --cached
git commit -m "PROD-238 full 프로필 피커를 overlay로 교정한다"
git push origin PROD-238
```

Expected: 승인된 full surface 교정과 직접 회귀 테스트만 포함된다. Terra 독립 리뷰에서 full stacking/listener,
compact/native leakage와 계약 정합성을 확인한 뒤 검증된 1.1·1.5·1.6 checkbox만 다시 완료한다.

---

### Task 6: Full picker를 프로필 이름 trigger 바로 아래로 옮긴다

**Files:**

- Modify: `docs/design/breakpoints.md`
- Modify: `openspec/changes/add-responsive-profile-picker/{proposal.md,design.md,decisions.md,tasks.md,specs/web-app-shell/spec.md}`
- Modify: `apps/app/src/components/shell/ProfileSwitcher.tsx:505-509`
- Test: `apps/app/src/stories/Shell.stories.tsx:194-216`
- Modify: `docs/superpowers/plans/2026-07-26-responsive-profile-picker.md`

**Interfaces:**

- Consumes: 고정 full summary geometry(`profileCopy.top=140`, `spacing.sm=8`, `fullTrigger.height=42`)
- Produces: picker visual wrapper top `190px`, semantic menu region top과 trigger bottom 사이 `0–12px`, navigation 위치 불변

**테스트 코드 범위:** 기존 `ResponsiveProfilePickerFull` interaction의 세로 geometry assertion만 교체한다.

**테스트 필요성:** summary bottom assertion은 picker가 이름 trigger에서 70px 떨어져 navigation 시작점에 보이는 회귀를
통과시킨다. trigger bottom과 semantic menu top의 인접성을 직접 검증해야 같은 위치 오류를 잡을 수 있다.

**테스트 제외 범위:** 새 story/helper/harness, compact·drawer 중복 geometry, runtime measurement/ResizeObserver,
GraphQL·Relay·native 테스트 확대.

- [x] **Step 1: trigger 하단 인접성 RED를 작성한다**

`ResponsiveProfilePickerFull`에서 `summary.bottom` 기준 assertion을 다음 observable geometry로 교체한다.

```tsx
const triggerRect = trigger.getBoundingClientRect();

await userEvent.click(trigger);
const menu = await canvas.findByRole('menu', { name: '프로필 전환' });
const menuRect = menu.getBoundingClientRect();

expect(menuRect.top).toBeGreaterThanOrEqual(triggerRect.bottom);
expect(menuRect.top - triggerRect.bottom).toBeLessThanOrEqual(12);
expect(openNavigationTop).toBe(closedNavigationTop);
```

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: 현재 `top: 260`에서는 semantic menu top과 trigger bottom 사이가 약 77px이므로 두 번째 assertion이 FAIL한다.

- [x] **Step 2: fixed full geometry에 맞춰 GREEN을 만든다**

현재 full summary는 `profileCopy.top=140`, `paddingTop=spacing.sm(8)`, `fullTrigger.height=42`로 고정돼 있으므로
`fullOverlayPosition.top`을 합계 `190`으로 바꾼다. runtime measurement, 새 prop·상수·listener는 추가하지 않는다.

```tsx
fullOverlayPosition: { left: 0, top: 190 },
```

Run:

```bash
pnpm --filter @kosmo/app test:storybook -- Shell
```

Expected: 새 인접성 assertion, navigation 불변, outside dismissal을 포함한 기존 Shell interaction이 모두 통과한다.

- [x] **Step 3: 1280·1440px 시각 stop gate를 확인한다**

`ResponsiveProfilePickerFull`과 `UniversalFull`에서 picker wrapper가 이름 trigger 바로 아래에서 시작하고, 그 아래의
프로필 상세와 navigation 위에 paint되며, open 전후 navigation·sidebar·center·right rail layout이 움직이지 않는지
확인한다. clipping 또는 center sibling 뒤 paint가 확인되면 범위를 확대하지 않고 중단한다.

- [x] **Step 4: 자동 검증과 독립 리뷰를 수행한다**

Run:

```bash
pnpm --filter @kosmo/app check
pnpm exec openspec validate add-responsive-profile-picker --strict
pnpm exec openspec validate --all --strict
pnpm exec prettier --check docs/design/breakpoints.md docs/superpowers/plans/2026-07-26-responsive-profile-picker.md openspec/changes/add-responsive-profile-picker apps/app/src/components/shell/ProfileSwitcher.tsx apps/app/src/stories/Shell.stories.tsx
git diff --check
```

Expected: 모든 명령이 exit code 0이고 독립 reviewer가 P0–P2 없이 trigger anchor, navigation 불변, compact/native 비회귀와
계약 정합성을 확인한다. 그 뒤 OpenSpec 1.7을 완료 처리하고 checkpoint commit·push한다.
