# PROD-372 Best-Effort Notification Read Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Follow Notification의 Avatar 또는 본문 link activation이 Related Profile로 즉시 이동하면서, 독립적인 Read mutation 성공 payload로 정확한 item과 Recipient Profile의 Relay cache를 동기화한다.

**Architecture:** `NotificationListItem`에 fragment와 colocate한 `markNotificationRead` mutation을 추가하고 두 기존 `Link`의 child `Pressable`에서 mutation을 비차단으로 시작한다. Relay는 `notification.id/readAt`과 `recipientProfile.id/unreadNotificationCount`를 ID 기준으로 정규화하며, 별도 updater·optimistic update·refetch·앱 retry는 사용하지 않는다. Storybook은 navigation 독립성을, plain `relay-runtime` unit test는 record normalization과 actor Store 격리를 검증한다.

**Tech Stack:** TypeScript, React 19, React Native, Expo Router, React Relay 21, relay-runtime 21, Node test runner, Storybook Vitest/Playwright, OpenSpec

## Global Constraints

- Avatar와 본문 link의 각 activation은 Read mutation을 한 번 시작하되 navigation을 await, prevent, cancel 또는 rollback하지 않는다.
- mutation은 `notification { id readAt }`과 `recipientProfile { id unreadNotificationCount }`를 선택한다.
- explicit updater, optimistic update, client-side count 산술, 성공 뒤 추가 refetch, 앱 수준 자동 retry와 오류 UI를 추가하지 않는다.
- 실패는 item/count cache를 변경하지 않으며 이후 activation 또는 refetch가 서버 source of truth로 수렴하게 한다.
- selected Profile을 cache target으로 추론하지 않고 성공 payload의 Recipient Profile ID를 사용한다.
- API·DB·dependency·shell badge UI는 변경하지 않는다.
- actor별 Relay Environment/Store 격리와 기존 Expo Router `Link` semantics를 유지한다.
- Relay generated `__generated__` artifact는 생성하되 commit하지 않는다.
- `add-in-app-notifications`는 PROD-271 전체 계약이 완료될 때까지 active로 유지하고 이번 PR에서 archive하지 않는다.
- 현재 worktree는 `origin/main`의 `ac7c005`에서 detached 상태이고 `prod-372` 브랜치는 존재하지 않는다. 첫 commit 전에 현재 변경을 보존한 채 `prod-372`를 생성한다.
- 각 체크포인트는 한국어 commit으로 남기고 즉시 `origin/prod-372`에 push한다.
- 첫 OpenSpec 체크포인트 push 직후 `main` base의 한국어 Draft PR을 열고, 구현·검증 상태가 바뀔 때마다 본문을 갱신한다. Ready 전환은 별도 사용자 확인 뒤 수행한다.

---

### Task 1: 승인된 OpenSpec과 실행 계획 체크포인트

**Files:**

- Modify: `openspec/changes/add-in-app-notifications/proposal.md`
- Modify: `openspec/changes/add-in-app-notifications/design.md`
- Modify: `openspec/changes/add-in-app-notifications/decisions.md`
- Modify: `openspec/changes/add-in-app-notifications/specs/notification/spec.md`
- Modify: `openspec/changes/add-in-app-notifications/tasks.md`
- Create: `docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md`

**Interfaces:**

- Consumes: 승인된 PROD-372 Linear 범위와 `add-in-app-notifications` OpenSpec Gate
- Produces: PROD-277/372/324 ownership, payload normalization, 실패 수렴과 검증 경계를 고정한 구현 계약

- [ ] **Step 1: 현재 변경과 base 확인**

Run:

```bash
git status --short --branch
git diff --check
git diff -- openspec/changes/add-in-app-notifications docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md
git rev-parse HEAD
git rev-parse origin/main
```

Expected: detached HEAD와 `origin/main`이 모두 `ac7c005`; 변경은 OpenSpec 5개 artifact와 이 plan뿐이고 `git diff --check` exit code 0.

- [ ] **Step 2: OpenSpec Gate 재검증**

Run:

```bash
pnpm exec openspec validate add-in-app-notifications --strict
pnpm exec openspec status --change add-in-app-notifications --json
```

Expected: `Change 'add-in-app-notifications' is valid`; schema는 `spec-driven-decisions`; proposal/specs/design/decisions/tasks artifact가 모두 `done`.

- [ ] **Step 3: PROD-372 브랜치 생성**

Run:

```bash
git switch -c prod-372
git branch --show-current
```

Expected: 현재 uncommitted OpenSpec/plan 변경을 그대로 보존하며 branch가 `prod-372`로 출력된다. sandbox가 `.git` 쓰기를 막으면 우회하지 않고 Codex App의 **Create branch**로 `prod-372`를 만든 뒤 다시 확인한다.

- [ ] **Step 4: OpenSpec 체크포인트 commit과 push**

Run:

```bash
git add openspec/changes/add-in-app-notifications/proposal.md \
  openspec/changes/add-in-app-notifications/design.md \
  openspec/changes/add-in-app-notifications/decisions.md \
  openspec/changes/add-in-app-notifications/specs/notification/spec.md \
  openspec/changes/add-in-app-notifications/tasks.md \
  docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md
git diff --cached --check
git diff --cached
git commit -m "PROD-372 알림 Read와 cache 동기화 계약을 확정한다"
git push -u origin prod-372
```

Expected: 승인된 artifact와 plan만 commit되고 push가 성공한다. `Co-authored-by` trailer는 없다.

- [ ] **Step 5: Draft PR 생성**

PR target과 제목:

```text
base: main
head: prod-372
title: 알림 읽음 상태를 Profile 이동과 독립적으로 동기화한다
```

초기 본문:

```markdown
## 무엇을 변경했는지

- PROD-372의 best-effort Read와 Relay cache 소유권을 기존 알림 OpenSpec에 분리했습니다.
- 구현·검증 순서를 실행 계획으로 고정했습니다.
- 애플리케이션 구현은 아직 진행 중입니다.

## 왜 변경했는지

현재 알림 항목은 Related Profile로 이동하지만 Read mutation과 item/count cache 동기화가 연결되지 않았습니다.

## 이번 PR의 주요 결정

- 승인된 OpenSpec decision에 따라 성공 payload의 Relay normalization을 사용합니다.
- explicit updater, optimistic update, 추가 refetch와 앱 수준 자동 retry는 사용하지 않습니다.

## 어떻게 확인할 수 있는지

- `pnpm exec openspec validate add-in-app-notifications --strict`

## 아직 어떤 문제가 남았는지

- NotificationListItem mutation 연결과 Storybook/Relay store 검증이 남아 있습니다.
```

Run:

```bash
gh pr create --draft --base main --head prod-372 \
  --title "알림 읽음 상태를 Profile 이동과 독립적으로 동기화한다" \
  --body-file /tmp/prod-372-pr-body.md
```

위 초기 본문을 `/tmp/prod-372-pr-body.md`에 정확히 저장한 뒤 실행한다. Expected: 위 본문으로 Draft PR이 생성되고 `baseRefName=main`, `headRefName=prod-372`, `isDraft=true`다.

---

### Task 2: Read mutation payload normalization TDD

**Files:**

- Modify: `apps/app/src/components/notification/NotificationListItem.tsx`
- Create: `apps/app/src/components/notification/NotificationListItem.test.ts`
- Generated, do not commit: `apps/app/src/components/notification/__generated__/NotificationListItemMarkReadMutation.graphql.ts`

**Interfaces:**

- Consumes: `markNotificationRead(input: { id })`, `MarkNotificationReadPayload.notification`, `MarkNotificationReadPayload.recipientProfile`
- Produces: `NotificationListItemMarkReadMutation($id: ID!)` operation selecting normalized item and Recipient Profile fields

- [x] **Step 1: 실패하는 Relay store test 작성**

Create `NotificationListItem.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { commitMutation } from 'react-relay';
import {
  createOperationDescriptor,
  Environment,
  getRequest,
  Network,
  RecordSource,
  Store,
} from 'relay-runtime';
import MarkReadMutation from './__generated__/NotificationListItemMarkReadMutation.graphql';
import type { NotificationListItemMarkReadMutation } from './__generated__/NotificationListItemMarkReadMutation.graphql';

const notificationId = 'notification-unread';
const recipientId = 'notification-profile-content';
const otherRecipientId = 'notification-profile-other';
const readAt = '2026-07-21T12:00:00Z';

function createEnvironment() {
  const source = new RecordSource();
  source.set(notificationId, {
    __id: notificationId,
    __typename: 'FollowNotification',
    id: notificationId,
    readAt: null,
  });
  source.set(recipientId, {
    __id: recipientId,
    __typename: 'Profile',
    id: recipientId,
    unreadNotificationCount: 2,
  });
  source.set(otherRecipientId, {
    __id: otherRecipientId,
    __typename: 'Profile',
    id: otherRecipientId,
    unreadNotificationCount: 7,
  });

  return new Environment({
    network: Network.create(() => Promise.reject(new Error('network is not used'))),
    store: new Store(source),
  });
}

function commitReadPayload(environment: Environment) {
  const operation = createOperationDescriptor(getRequest(MarkReadMutation), {
    id: notificationId,
  });
  environment.commitPayload(operation, {
    markNotificationRead: {
      notification: { __typename: 'FollowNotification', id: notificationId, readAt },
      recipientProfile: {
        __typename: 'Profile',
        id: recipientId,
        unreadNotificationCount: 1,
      },
    },
  });
}

function requireRecord(environment: Environment, id: string) {
  const record = environment.getStore().getSource().get(id);
  assert.ok(record);
  return record;
}

describe('NotificationListItem Read cache', () => {
  it('normalizes the exact Notification and Recipient Profile', () => {
    const environment = createEnvironment();

    commitReadPayload(environment);

    assert.equal(requireRecord(environment, notificationId).readAt, readAt);
    assert.equal(requireRecord(environment, recipientId).unreadNotificationCount, 1);
    assert.equal(requireRecord(environment, otherRecipientId).unreadNotificationCount, 7);
  });

  it('keeps repeated final payloads and another actor Store isolated', () => {
    const actorA = createEnvironment();
    const actorB = createEnvironment();

    commitReadPayload(actorA);
    commitReadPayload(actorA);

    assert.equal(requireRecord(actorA, notificationId).readAt, readAt);
    assert.equal(requireRecord(actorA, recipientId).unreadNotificationCount, 1);
    assert.equal(requireRecord(actorB, notificationId).readAt, null);
    assert.equal(requireRecord(actorB, recipientId).unreadNotificationCount, 2);
  });

  it('leaves records unchanged after a network failure', async () => {
    const environment = createEnvironment();

    await new Promise<void>((resolve, reject) => {
      commitMutation<NotificationListItemMarkReadMutation>(environment, {
        mutation: MarkReadMutation,
        variables: { id: notificationId },
        onCompleted: () => reject(new Error('network failure must not complete')),
        onError: () => resolve(),
      });
    });

    assert.equal(requireRecord(environment, notificationId).readAt, null);
    assert.equal(requireRecord(environment, recipientId).unreadNotificationCount, 2);
  });
});
```

- [x] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @kosmo/app test:unit
```

Expected: `NotificationListItemMarkReadMutation.graphql` module이 아직 없어 FAIL한다. 다른 기존 unit test 실패는 없어야 한다.

- [x] **Step 3: fragment ID와 mutation document 추가**

Modify `NotificationListItem.tsx`의 GraphQL documents:

```tsx
const notificationFragment = graphql`
  fragment NotificationListItem_notification on FollowNotification {
    id
    createdAt
    readAt
    profile {
      displayName
      handle
      relativeHandle
    }
  }
`;

export const notificationListItemMarkReadMutation = graphql`
  mutation NotificationListItemMarkReadMutation($id: ID!) {
    markNotificationRead(input: { id: $id }) {
      notification {
        id
        readAt
      }
      recipientProfile {
        id
        unreadNotificationCount
      }
    }
  }
`;
```

exported document는 같은 component가 소유하며 공용 query helper로 이동하지 않는다. generated type import는 실제로 사용하는 Task 3에서 추가한다.

- [x] **Step 4: GREEN 확인**

Run:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app check
```

Expected: Relay compiler가 mutation artifact를 생성하고 store test와 기존 unit test가 PASS하며 TypeScript check가 exit code 0이다.

- [x] **Step 5: payload contract 체크포인트 commit과 push**

Run:

```bash
git status --short
git add apps/app/src/components/notification/NotificationListItem.tsx \
  apps/app/src/components/notification/NotificationListItem.test.ts \
  docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md
git diff --cached --check
git diff --cached
git commit -m "PROD-372 Read payload 정규화 계약을 고정한다"
git push origin prod-372
```

Expected: generated artifact는 staged되지 않고 component document, unit test와 plan 진행 상태만 push된다.

---

### Task 3: 두 Profile Link의 비차단 Read interaction TDD

**Files:**

- Modify: `apps/app/src/stories/Notifications.stories.tsx`
- Modify: `apps/app/src/components/notification/NotificationListItem.tsx`
- Modify: `apps/app/.storybook/mocks/expo-router.tsx` (test harness의 client-navigation emulation이 browser 기본 navigation을 막고 mock pathname만 갱신)

**Interfaces:**

- Consumes: `notificationListItemMarkReadMutation`, `NotificationListItemMarkReadMutation`, Storybook `relay.mutationResponse/error/loading`, Router mock `usePathname`
- Produces: 두 기존 Profile link에서 `commitMarkRead({ variables: { id } })`를 시작하되 navigation을 그대로 유지하는 interaction

- [x] **Step 1: 실패하는 Storybook interaction 작성**

Add imports and a pathname probe to `Notifications.stories.tsx`:

```tsx
import { usePathname } from 'expo-router';
import { Text } from 'react-native';

function ReadNavigationList() {
  const pathname = usePathname();
  return (
    <>
      <Text testID="notification-story-pathname">{pathname}</Text>
      <RefreshList />
    </>
  );
}

const readMutationResponse = {
  markNotificationRead: {
    notification: {
      __typename: 'FollowNotification',
      id: 'notification-unread',
      readAt: '2026-07-21T12:00:00Z',
    },
    recipientProfile: {
      __typename: 'Profile',
      id: 'notification-profile-content',
      unreadNotificationCount: 2,
    },
  },
};
```

Add interaction stories:

```tsx
export const ReadSuccessNormalizesAndNavigates: Story = {
  parameters: { relay: { mutationResponse: readMutationResponse } },
  render: () => <ReadNavigationList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    await expect(
      canvas.findByRole('link', { name: '별빛 여행자 프로필로 이동.' }),
    ).resolves.toBeVisible();
  },
};

export const ReadPendingDoesNotBlockAvatarNavigation: Story = {
  parameters: { relay: { mutationLoading: true } },
  render: () => <ReadNavigationList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('link', {
        name: '별빛 여행자 프로필로 이동. 읽지 않은 알림.',
      }),
    );
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(
      canvas.getByRole('link', {
        name: '별빛 여행자 프로필로 이동. 읽지 않은 알림.',
      }),
    ).toBeVisible();
  },
};

export const ReadNetworkErrorDoesNotBlockCopyNavigation: Story = {
  parameters: { relay: { mutationError: 'Read failed' } },
  render: () => <ReadNavigationList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const ReadGraphQLErrorDoesNotBlockNavigation: Story = {
  parameters: { relay: { mutationGraphQLErrors: ['Read failed'] } },
  render: () => <ReadNavigationList />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('link', { name: /별빛 여행자님이 팔로우했습니다/ }));
    await expect(canvas.findByText('/@starlight')).resolves.toBeVisible();
    expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
```

- [x] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:storybook -- Notifications
```

Expected: 기존 Link navigation assertion은 통과하지만 success story의 item은 계속 Unread이므로 `별빛 여행자 프로필로 이동.` 기대에서 FAIL한다.

- [x] **Step 3: `useMutation`과 두 link handler 연결**

Modify `NotificationListItem.tsx`:

```tsx
import { graphql, useFragment, useMutation } from 'react-relay';
import type { NotificationListItemMarkReadMutation } from './__generated__/NotificationListItemMarkReadMutation.graphql';

export function NotificationListItem({ notification }: NotificationListItemProps) {
  const theme = useTheme();
  const [hovered, setHovered] = useState(false);
  const data = useFragment(notificationFragment, notification);
  const [commitMarkRead] = useMutation<NotificationListItemMarkReadMutation>(
    notificationListItemMarkReadMutation,
  );
  // existing derived display values stay unchanged

  const markRead = () => {
    commitMarkRead({
      onError: () => undefined,
      variables: { id: data.id },
    });
  };
```

Add the same non-blocking handler to both existing child `Pressable`s:

```tsx
<Pressable
  accessibilityLabel={`${name} 프로필로 이동.${unreadDescription}`}
  accessibilityRole="link"
  onPress={markRead}
  style={styles.avatarLink}
>
```

```tsx
<Pressable
  accessibilityLabel={actionLabel}
  accessibilityRole="link"
  onPress={markRead}
  style={styles.copyLink}
>
```

Do not inspect loading state, await the commit, call `preventDefault`, add local error state, or dispose the request during navigation.

- [x] **Step 4: GREEN과 focused 회귀 확인**

Run:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app test:storybook -- Notifications
pnpm --filter @kosmo/app check
```

Expected: success/pending/network error/GraphQL error stories와 기존 Notifications stories가 모두 PASS; store tests와 TypeScript check도 exit code 0.

- [x] **Step 5: interaction 체크포인트 commit과 push**

Run:

```bash
git add apps/app/src/components/notification/NotificationListItem.tsx \
  apps/app/src/stories/Notifications.stories.tsx \
  docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md
git diff --cached --check
git diff --cached
git commit -m "PROD-372 알림 이동과 Read 요청을 연결한다"
git push origin prod-372
```

Expected: 두 link interaction과 Storybook 검증만 추가되고 Draft PR CI가 새 commit으로 갱신된다.

---

### Task 4: 전체 검증, OpenSpec 완료 표시와 Draft PR 동기화

**Files:**

- Modify: `openspec/changes/add-in-app-notifications/tasks.md`
- Modify: `docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md`
- Review: all PROD-372 implementation files from Tasks 1-3

**Interfaces:**

- Consumes: OpenSpec tasks 9.2-9.6, app Relay compiler/unit/Storybook/build commands, Draft PR
- Produces: 검증 증거가 연결된 완료된 PROD-372 slice; active OpenSpec change와 Draft PR 상태 유지

- [x] **Step 1: focused 및 전체 app 검증**

Run in order:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app test:storybook -- Notifications
pnpm --filter @kosmo/app check
pnpm --filter @kosmo/app build-storybook
pnpm --filter @kosmo/app export:web
pnpm exec openspec validate add-in-app-notifications --strict
git diff --check
```

Expected: 모든 명령 exit code 0. `apps/app/src/**/__generated__`는 tracked diff에 나타나지 않는다.

- [x] **Step 2: Web/native smoke와 확인 불가 항목 기록**

Web에서는 Storybook browser interaction 결과와 `export:web` 성공으로 link click, pending/error navigation과 bundle 생성을 확인한다.

Native tooling이 준비된 로컬 환경에서는 다음을 각각 실행한다.

```bash
pnpm --filter @kosmo/app ios
pnpm --filter @kosmo/app android
```

Expected: 앱이 install/launch되고 `/notifications`의 Avatar와 본문 link가 Read 응답을 기다리지 않고 Profile route로 이동한다. 계정/fixture 또는 native tooling이 없어 수행할 수 없으면 그 정확한 blocker를 PR의 검증 공백에 기록하고 Web 결과로 native 확인을 대체했다고 표현하지 않는다.

- [x] **Step 3: OpenSpec task와 plan 완료 표시**

`tasks.md`의 9.2-9.6과 이 plan에서 실제 완료한 step만 `[x]`로 바꾼다. PROD-324와 PROD-278/PROD-271 통합·archive task는 변경하지 않는다.

Run:

```bash
pnpm exec openspec validate add-in-app-notifications --strict
git diff --check
git status --short
```

Expected: strict validation PASS; PROD-372 task만 완료되고 전체 OpenSpec change는 active로 남는다.

- [x] **Step 4: 최종 checkpoint commit과 push**

Run:

```bash
git add openspec/changes/add-in-app-notifications/tasks.md \
  docs/superpowers/plans/2026-07-21-prod-372-best-effort-notification-read.md
git diff --cached --check
git diff --cached
git commit -m "PROD-372 알림 Read 검증을 완료한다"
git push origin prod-372
```

Expected: 검증 상태 문서만 마지막 checkpoint에 포함되고 push가 성공한다.

- [x] **Step 5: Draft PR 본문 최종 갱신**

최종 본문은 다음 내용을 사용한다.

```markdown
## 무엇을 변경했는지

- Follow Notification의 Avatar와 본문 link activation에서 Read mutation을 비차단으로 시작합니다.
- 성공 payload의 Notification/Recipient Profile을 Relay normalization으로 갱신합니다.
- navigation 독립성과 Profile별 cache 격리를 Storybook 및 Relay store test로 검증합니다.

## 왜 변경했는지

알림 항목이 Related Profile로 이동해도 읽음 상태와 visible Unread count cache가 연결되지 않아 목록·후속 badge가 서버 상태와 어긋날 수 있었습니다.

## 이번 PR의 주요 결정

### 성공 payload 기반 Relay normalization

- 선택: explicit updater나 optimistic count 감소 없이 서버가 반환한 Notification과 Recipient Profile record를 정규화합니다.
- 고려한 대안: explicit updater, optimistic update와 rollback, 성공 뒤 refetch, 앱 자동 retry.
- 이유: 반복·동시 Read의 최종 값을 서버 idempotency가 소유하고 다른 Profile cache 오염을 피할 수 있습니다.
- 감수한 결과: 실패 뒤에는 다음 activation 또는 refetch 전까지 기존 cache가 남을 수 있습니다.
- 관련 근거: PROD-372와 `add-in-app-notifications/decisions.md`의 2026-07-21 결정.

## 어떻게 확인할 수 있는지

- `pnpm --filter @kosmo/app test:unit`
- `pnpm --filter @kosmo/app test:storybook -- Notifications`
- `pnpm --filter @kosmo/app check`
- `pnpm --filter @kosmo/app build-storybook`
- `pnpm --filter @kosmo/app export:web`
- `pnpm exec openspec validate add-in-app-notifications --strict`

## 아직 어떤 문제가 남았는지

- PROD-324 shell badge와 PROD-271 최종 통합/E2E/archive는 후속 책임으로 남습니다.
- 실행하지 못한 native smoke가 있으면 환경 blocker를 여기에 기록합니다.
```

Draft 상태를 유지한 채 현재 `headRefOid`, CI, mergeability를 확인하고 사용자에게 구현 결과·검증·native gap을 보고한다. Ready 전환은 사용자가 대상 PR과 최종 본문을 확인한 뒤 별도로 수행한다.

위 최종 본문을 `/tmp/prod-372-pr-body.md`에 정확히 저장한 뒤 다음을 실행한다.

```bash
gh pr edit prod-372 --body-file /tmp/prod-372-pr-body.md
gh pr view prod-372 --json number,title,headRefName,baseRefName,isDraft,state,url,mergeStateStatus
```

---

## Plan Self-Review

- OpenSpec 9.2는 Task 2 mutation selection과 store test가 담당한다.
- OpenSpec 9.3은 Task 3의 두 `Link` child `onPress`가 담당한다.
- OpenSpec 9.4는 Task 3 success/pending/network/GraphQL error Storybook stories가 담당한다.
- OpenSpec 9.5는 Task 2의 exact Recipient, repeated payload와 actor Store isolation test가 담당한다.
- OpenSpec 9.6은 Task 4의 compiler, unit, Storybook, build, Web export, strict validation과 native smoke/gap 보고가 담당한다.
- API·DB·dependency·badge UI와 OpenSpec archive를 변경하는 step은 없다.
