# Notification Row Hover Background Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 알림 행의 상시 회색 Unread 배경을 제거하고 Web pointer hover 중에만 회색 피드백을 제공한다.

**Architecture:** `NotificationListItem`이 Web hover 여부를 local state로 관리하고 행 배경을 `hovered ? theme.surface : theme.card`로 선택한다. `readAt`은 시각 배경에 관여하지 않고 기존 접근성 label의 Unread 상태에만 사용한다.

**Tech Stack:** React Native, React Native Web, Expo Router, React Relay, Storybook Vitest

## Global Constraints

- Read 여부와 관계없이 item의 기본 배경은 `card`다.
- Web pointer hover 중인 item만 `surface` 배경을 사용한다.
- Native는 hover 배경 없이 `card`를 유지한다.
- Unread 접근성 label과 Profile 링크 동작은 유지한다.
- 새 dependency나 platform 전용 컴포넌트를 추가하지 않는다.

---

### Task 1: Follow 알림 행 hover 배경

**Files:**

- Modify: `apps/app/src/stories/Notifications.stories.tsx`
- Modify: `apps/app/src/components/notification/NotificationListItem.tsx`

**Interfaces:**

- Consumes: `NotificationListItem({ notification })`, `theme.card`, `theme.surface`, React Native `Pressable` hover event
- Produces: Web hover 동안만 `surface`를 표시하고 기본 `card`를 유지하는 Follow 알림 행

- [x] **Step 1: 실패하는 Storybook interaction test 작성**

`HoverBackgroundFeedback` story를 `RefreshList`로 추가하고 첫 Unread 행을 접근성 link에서 root까지 찾아 다음을 검증한다.

```tsx
expect(row).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
await userEvent.hover(row!);
expect(row).toHaveStyle({ backgroundColor: 'rgb(246, 246, 246)' });
await userEvent.unhover(row!);
expect(row).toHaveStyle({ backgroundColor: 'rgb(255, 255, 255)' });
```

- [x] **Step 2: RED 확인**

Run: `pnpm --filter @kosmo/app test:storybook -- Notifications`

Expected: 첫 Unread 행의 기본 배경이 현재 `surface`이므로 흰색 기대에서 FAIL한다.

- [x] **Step 3: 최소 구현**

`NotificationListItem`의 root를 `Pressable`로 바꾸고 Web hover state를 반영한다.

```tsx
const [hovered, setHovered] = useState(false);

<Pressable
  onHoverIn={Platform.OS === 'web' ? () => setHovered(true) : undefined}
  onHoverOut={Platform.OS === 'web' ? () => setHovered(false) : undefined}
  style={[
    styles.root,
    {
      backgroundColor: hovered ? theme.surface : theme.card,
      borderColor: theme.border,
    },
  ]}
>
```

`unread` 계산은 action 접근성 label을 위해 유지한다. root에는 action role을 추가하지 않아 내부 Avatar·본문 link 의미를 보존한다.

- [x] **Step 4: GREEN과 회귀 확인**

Run: `pnpm --filter @kosmo/app test:storybook -- Notifications`

Expected: 47개 Storybook test가 모두 PASS하고 hover 전·중·후 배경 기대가 통과한다.

- [x] **Step 5: 정적·플랫폼 검증**

Run:

```bash
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app build-storybook
pnpm exec openspec validate add-in-app-notifications --strict
```

Expected: 각 명령 exit code 0.

- [x] **Step 6: 시각 확인과 커밋**

Storybook을 390px와 600px로 캡처해 기본 흰 배경을 확인하고 Web browser에서 hover 시에만 회색으로 바뀌는지 확인한다.

```bash
git add apps/app/src/components/notification/NotificationListItem.tsx apps/app/src/stories/Notifications.stories.tsx docs/superpowers/plans/2026-07-20-notification-row-hover-background.md
git commit -m "PROD-277 알림 행 배경을 hover로 제한한다"
git push origin prod-277
```
