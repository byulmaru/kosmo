# PROD-696 Post 목록 Reply 대상 표시 Implementation Plan

> **For KOSMO agentic workers:** REQUIRED SUB-SKILL: Use `kosmo-codex-workflows:orchestrate-subagents` before dispatch. Use the configured `implementation_worker` only for the approved bounded product/test diff and `implementation_reviewer` for independent review; never substitute a generic agent.

**Goal:** 조회 가능한 Reply Parent를 가진 일반 Post 목록의 Reply와 Reply+Quote 위에 비대화형 `{displayName}님에게 답글` attribution을 한 번 표시하고 상세 thread 전체에서는 숨긴다.

**Architecture:** `PostListItem`의 nullable Reply Parent fragment에 Parent 작성자 display name을 추가하고, 현재 Repost attribution의 icon column·text slot·typography·간격만 private layout component로 분리한다. Repost는 기존 Profile link를 그대로 전달하고 Reply는 Message Circle icon과 plain text를 전달한다. 상세 `PostDetailThread` caller는 조상·하위 `PostListItem`에서 목록 전용 Reply attribution을 명시적으로 끈다.

**Tech Stack:** React 19, React Native/React Native Web, Expo Router, React Relay 21, `lucide-react-native`, Storybook 10, Vitest browser project, OpenSpec 1.3.1, pnpm 11.

## Global Constraints

- Canonical copy는 `{displayName}님에게 답글`이다.
- Reply attribution은 Message Circle icon과 plain text이며 클릭 동작, Post navigation, Profile navigation을 제공하지 않는다.
- 장식 Reply icon은 접근성 트리에서 숨기고 문구만 텍스트로 인식되게 한다.
- 일반 Reply와 Reply+Quote에는 한 번 표시하고, Parent 미조회·일반 Post·Content 없는 순수 Repost에는 표시하지 않는다.
- 상세 thread의 조상·현재·하위 모든 행에는 목록용 Reply attribution을 표시하지 않는다.
- Repost와 Reply attribution은 layout만 공유하고 interaction·접근성 의미는 각 caller가 소유한다.
- 기존 Reply Parent visibility, Post List 후보, Repost·Quote presentation, thread connector·행 구성, Reply Composer, GraphQL schema·resolver, database, migration, federation, route와 dependency를 변경하지 않는다.
- Relay generated `__generated__` artifact는 실행 중 재생성하되 stage·commit하지 않는다.
- `.superpowers/**`와 `docs/superpowers/**`는 stage·commit·PR에 포함하지 않는다.
- 테스트 코드 범위: `apps/app/src/stories/fixtures.ts`, `apps/app/src/stories/Posts.stories.tsx`의 기존 fixture와 가장 가까운 Storybook assertion만 수정한다.
- 테스트 제외 범위: 새 fixture helper/harness, snapshot·coverage 확대, 광범위한 E2E, 테스트 인프라 변경, 미보유 Native runtime 자동화.
- Web 자동화·Web 수동 관찰·공용 Native source mapping·실제 iOS/Android runtime은 서로 다른 검증 증거로 보고한다.

## File Map

- Modify: `docs/design/post-action-bar.md` — 승인된 공용 attribution 행과 Reply 변형의 canonical geometry·semantics.
- Modify: `docs/design/post-thread.md` — 상세 thread 조상·현재·하위 전체의 목록 attribution 제외 계약.
- Create: `openspec/changes/show-post-list-reply-target/{proposal.md,design.md,decisions.md,tasks.md}` — PROD-696 scope, 구현 guidance, durable decisions와 책임.
- Create: `openspec/changes/show-post-list-reply-target/specs/post-reply-ui/spec.md` — 기존 `post-reply-ui` capability의 delta requirement.
- Create: `openspec/changes/show-post-list-reply-target/implementation-plan.md` — 승인받을 실행 계획.
- Modify: `apps/app/src/stories/fixtures.ts` — Reply Parent fixture reference가 조회되는 Parent Profile을 표현하게 한다.
- Modify: `apps/app/src/stories/Posts.stories.tsx` — 일반 Reply·Reply+Quote·Parent 미조회·상세 thread·Repost 회귀 fixture와 assertion.
- Modify: `apps/app/src/components/post/PostListItem.tsx` — Parent fragment, 공용 attribution layout, 일반 목록 표시 경계.
- Modify: `apps/app/src/components/post/PostDetailThread.tsx` — 상세 thread의 조상·하위 목록 attribution을 명시적으로 끈다.
- Archive output after completion: `openspec/specs/post-reply-ui/spec.md`, `openspec/changes/archive/2026-08-06-show-post-list-reply-target/**`.

---

### Task 1: 계약 checkpoint, 브랜치와 Draft PR

**Files:**

- Modify: `docs/design/post-action-bar.md`
- Modify: `docs/design/post-thread.md`
- Create: `openspec/changes/show-post-list-reply-target/proposal.md`
- Create: `openspec/changes/show-post-list-reply-target/specs/post-reply-ui/spec.md`
- Create: `openspec/changes/show-post-list-reply-target/design.md`
- Create: `openspec/changes/show-post-list-reply-target/decisions.md`
- Create: `openspec/changes/show-post-list-reply-target/tasks.md`
- Create: `openspec/changes/show-post-list-reply-target/implementation-plan.md`

**Interfaces:**

- Consumes: PROD-696, `docs/domain/policies/post-list.md`, existing `post-reply-ui` spec, approved Repost attribution layout-only reuse decision.
- Produces: strictly valid `show-post-list-reply-target` change and branch `codex/prod-696`; later tasks implement only this contract.

- [ ] **Step 1: Confirm the exact starting state**

Run:

```bash
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Expected: detached `HEAD` at the same commit as `origin/main`; only the two approved design docs, `openspec/changes/show-post-list-reply-target/**`, and no unrelated user changes are present. If `HEAD != origin/main` or unrelated changes appear, stop before branching and report the exact diff.

- [ ] **Step 2: Create the implementation branch**

Run:

```bash
git switch -c codex/prod-696
```

Expected: current branch is `codex/prod-696`, based on the verified `origin/main` SHA.

- [ ] **Step 3: Revalidate the approved contract bundle**

Run:

```bash
./node_modules/.bin/openspec validate show-post-list-reply-target --strict
pnpm exec prettier --check docs/design/post-action-bar.md docs/design/post-thread.md openspec/changes/show-post-list-reply-target
git diff --check
```

Expected: OpenSpec valid, Prettier passes, and `git diff --check` prints nothing.

- [ ] **Step 4: Inspect the contract checkpoint scope**

Run:

```bash
git diff -- docs/design/post-action-bar.md docs/design/post-thread.md
git status --short
git diff --cached --name-only -- .superpowers docs/superpowers
```

Expected: no product code is changed; the last command prints nothing.

- [ ] **Step 5: Commit the contract checkpoint**

Stage only the approved documents and change directory, then commit:

```bash
git add docs/design/post-action-bar.md docs/design/post-thread.md openspec/changes/show-post-list-reply-target
git diff --cached --name-only
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-696 목록 Reply 대상 표시 계약을 정리한다"
```

Expected staged paths: the two canonical design docs and `openspec/changes/show-post-list-reply-target/**` only; no generated artifact and no Superpowers path.

- [ ] **Step 6: Push the checkpoint immediately**

Run:

```bash
git push -u origin codex/prod-696
```

Expected: remote branch `codex/prod-696` points at the contract checkpoint commit.

- [ ] **Step 7: Open the early Draft PR with the exact public scope**

Target: `byulmaru/kosmo`, base `main`, head `codex/prod-696`, Draft.

Title:

```text
[PROD-696] Post 목록에 답글 대상을 표시한다
```

Body:

```markdown
## 관련 이슈

- [PROD-696](https://linear.app/byulmaru/issue/PROD-696/post-목록에서-답글-대상을-표시한다)

## 변경 내용

- 일반 Post 목록의 Reply 대상 attribution 계약을 canonical design과 OpenSpec에 추가했습니다.
- Repost와 Reply attribution은 상단 행 layout만 공유하고 각 interaction 의미는 분리합니다.
- 상세 thread의 조상·현재·하위 전체에서는 목록용 Reply attribution을 숨깁니다.

## 결정

- Reply attribution은 Message Circle icon과 `{displayName}님에게 답글` 일반 텍스트를 사용합니다.
- Reply 문구에는 Post·Profile navigation이나 클릭 동작을 제공하지 않습니다.
- 두 경우만 지원하며 variant framework나 별도 공용 package를 추가하지 않습니다.

## 현재 상태

- [x] canonical design 동기화
- [x] OpenSpec proposal/spec/design/decisions/tasks 작성
- [ ] 공용 앱 fragment·renderer 구현
- [ ] 최소 Storybook 회귀 검증
- [ ] 전체 검증과 OpenSpec archive

## 검증

- [x] `openspec validate show-post-list-reply-target --strict`
- [x] 관련 문서 Prettier
- [x] `git diff --check`
- [ ] Relay compiler와 App typecheck
- [ ] 관련 Storybook/컴포넌트 테스트와 a11y
- [ ] Web 수동 확인

## 제외 범위

- Reply Parent preview·navigation, 상세 thread connector 변경
- Reply 후보·visibility·관계 정책과 Reply Composer 변경
- GraphQL schema·resolver, database, migration, federation, route·dependency 변경
- 광범위한 E2E와 테스트 인프라 변경

## 남은 위험

- Quote branch의 wrapper 조정 시 기존 Source preview geometry가 달라지지 않는지 확인해야 합니다.
- Web 검증은 실제 iOS·Android runtime 검증을 대체하지 않으며, 미실행 플랫폼 검증은 별도로 기록합니다.
```

Expected: Draft PR only. Do not mark Ready, request review, merge, close, resolve threads, comment, or mutate Linear status.

---

### Task 2: Failing Storybook contract for Reply attribution

**Files:**

- Modify: `apps/app/src/stories/fixtures.ts:90-155`
- Modify: `apps/app/src/stories/Posts.stories.tsx:338-722`
- Modify: `apps/app/src/stories/Posts.stories.tsx:2544-2665`
- Modify: `apps/app/src/stories/Posts.stories.tsx:3690-3755`

**Interfaces:**

- Consumes: existing `StoryPost`, `post()`, `profile()`, `ProductionRepostQuoteListIntegration`, and `PostDetailThreadRoute` Story patterns.
- Produces: Reply Parent 전용 reference type, an ordinary Reply fixture, accessible Parent display name payloads, and failing assertions for the missing production UI.

- [ ] **Step 1: Separate the Reply Parent fixture reference shape from viewer Repost references**

Keep `StoryPostReference` unchanged for `viewerRepost`, then add a Reply-specific type immediately below it:

```ts
export type StoryReplyParentReference = StoryPostReference & {
  profile: StoryProfile;
};
```

Replace `StoryPost.replyParent: StoryPostReference | null` with `StoryPost.replyParent: StoryReplyParentReference | null`, and replace `post()` input's `replyParent?: StoryPostReference | null` with `replyParent?: StoryReplyParentReference | null`. Do not change `viewerRepost` or add a fixture helper.

- [ ] **Step 2: Add one reusable Parent reference and one ordinary Reply fixture**

Immediately after `sourceAuthor`, add:

```ts
const replyTargetProfile = profile({
  displayName: 'Reply 대상 작성자',
  handle: 'reply-target',
  id: 'profile-reply-target',
  relativeHandle: '@reply-target',
});
const replyTargetReference = {
  __typename: 'Post' as const,
  id: 'post-reply-parent',
  profile: replyTargetProfile,
};
const replyPost = post({
  bodyText: '일반 목록에 표시되는 Reply입니다.',
  id: 'post-reply',
  replyParent: replyTargetReference,
});
```

Use `replyTargetReference` for both `replyQuotePost.replyParent` and `invalidContentlessReplySource.replyParent`.

- [ ] **Step 3: Make all existing Reply Parent fixture objects satisfy the requested Profile shape**

Add the exact `profile` source below to every existing literal:

| Child fixture                                                                | Parent id expression         | Profile expression                |
| ---------------------------------------------------------------------------- | ---------------------------- | --------------------------------- |
| `routeParentPost`                                                            | `routeRootPost.id`           | `routeRootPost.profile`           |
| `routeCurrentPost`                                                           | `routeParentPost.id`         | `routeParentPost.profile`         |
| `routeChildPost`                                                             | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `routeCreatedReply`                                                          | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `routeSiblingPost`                                                           | `routeParentPost.id`         | `routeParentPost.profile`         |
| `routeReplyQuotePost`                                                        | `routeSiblingPost.id`        | `routeSiblingPost.profile`        |
| `routeSourceNullPost`                                                        | `routeSiblingPost.id`        | `routeSiblingPost.profile`        |
| `routeVisibleParentPost`                                                     | `routeHiddenAncestorPost.id` | `routeHiddenAncestorPost.profile` |
| `routeBoundaryCurrentPost`                                                   | `routeVisibleParentPost.id`  | `routeVisibleParentPost.profile`  |
| `paginationInitialReplies`의 각 Post                                         | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `paginationInitialReply`                                                     | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `paginationFirstNextReply`                                                   | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `paginationDuplicateNextReply`                                               | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `paginationRetryReply`                                                       | `routeCurrentPost.id`        | `routeCurrentPost.profile`        |
| `ReplyListSurfaceSuccessLifecycle`의 `reply-created-from-list` mutation Post | `shortPost.id`               | `shortPost.profile`               |

Each object remains `{ __typename: 'Post', id: ..., profile: ... }`. Run `rg -n "replyParent:" apps/app/src/stories/Posts.stories.tsx` and inspect every non-null reference; none may omit `profile`.

- [ ] **Step 4: Give the fixture-only thread rows real Reply Parent data**

Replace the fixture-only thread definitions with this dependency-ordered block:

```ts
const threadRootPost = post({ bodyText: '대화의 시작입니다.', id: 'thread-root' });
const threadParentPost = post({
  bodyText: '직접 Parent Reply입니다.',
  id: 'thread-parent',
  replyParent: {
    __typename: 'Post',
    id: threadRootPost.id,
    profile: threadRootPost.profile,
  },
});
const threadCurrentPost = post({
  bodyText: '지금 보고 있는 Reply입니다.',
  id: 'thread-current',
  replyParent: {
    __typename: 'Post',
    id: threadParentPost.id,
    profile: threadParentPost.profile,
  },
});
const threadChildPost = post({
  bodyText: '현재 Reply에 이어진 답글입니다.',
  id: 'thread-child',
  replyParent: {
    __typename: 'Post',
    id: threadCurrentPost.id,
    profile: threadCurrentPost.profile,
  },
});
const threadSiblingPost = post({
  bodyText: '별도 분기의 답글입니다.',
  id: 'thread-sibling',
  replyParent: {
    __typename: 'Post',
    id: threadCurrentPost.id,
    profile: threadCurrentPost.profile,
  },
});
const threadQuoteSourcePost = post({
  bodyText: '인용된 Source 본문입니다.',
  id: 'thread-quote-source',
});
const threadReplyQuotePost = {
  ...post({
    bodyText: 'Reply이면서 Quote인 Post의 자체 Content입니다.',
    id: 'thread-reply-quote',
    replyParent: {
      __typename: 'Post',
      id: threadSiblingPost.id,
      profile: threadSiblingPost.profile,
    },
  }),
  repostSource: threadQuoteSourcePost,
};
```

Preserve the existing ids, body copy, Source and connector metadata exactly as shown.

- [ ] **Step 5: Include the ordinary Reply in the shared node payload and Home fixture**

Add `replyPost` once to `storyPosts`, and change the Home timeline input to:

```ts
const homeTimeline = timeline(
  ...[
    shortPost,
    replyPost,
    pureRepost,
    quotePost,
    replyQuotePost,
    quoteOfQuotePost,
    linkedSourceQuote,
  ].map(withReactionViewerState),
);
```

Do not add the Reply to the Profile fixture because canonical Profile Post List excludes Reply Parent posts.

- [ ] **Step 6: Add the observable list assertions**

In `ProductionRepostQuoteListIntegration.play`, add:

```ts
const replyRow = home
  .getByText('일반 목록에 표시되는 Reply입니다.')
  .closest<HTMLElement>('[role="article"]');
expect(replyRow).not.toBeNull();

const replyLabel = within(replyRow!).getByText('Reply 대상 작성자님에게 답글');
expect(replyLabel).toBeVisible();
expect(replyLabel.closest('a, button')).toBeNull();
expect(within(replyRow!).getAllByText('Reply 대상 작성자님에게 답글')).toHaveLength(1);
expect(within(replyRow!).queryByText('재게시한 코스모 사용자님이 재게시함')).toBeNull();

expect(home.getAllByText('Reply 대상 작성자님에게 답글')).toHaveLength(2);
expect(within(pureRepostRow!).queryByText('Reply 대상 작성자님에게 답글')).toBeNull();
expect(within(ordinaryCard).queryByText(/님에게 답글$/)).toBeNull();

const replyStandardRow = within(replyRow!).getByTestId('post-list-standard-row');
expect(replyLabel.getBoundingClientRect().height).toBe(20);
expect(
  replyStandardRow.getBoundingClientRect().top - replyLabel.getBoundingClientRect().bottom,
).toBeCloseTo(0, 0);
```

The count of two is exactly one ordinary Reply plus one Reply+Quote. Keep all existing Repost link and geometry assertions unchanged.

Update the existing exact Home article-order assertion for the newly inserted ordinary Reply:

```ts
expect(home.getAllByRole('article').map((row) => row.textContent)).toEqual([
  expect.stringContaining('짧은 본문 한 줄.'),
  expect.stringContaining('일반 목록에 표시되는 Reply입니다.'),
  expect.stringContaining('재게시한 코스모 사용자님이 재게시함'),
  expect.stringContaining('이 원문에 덧붙이는 인용자의 본문입니다.'),
  expect.stringContaining('답글 관계를 유지하는 인용입니다.'),
  expect.stringContaining('Source Quote를 인용하는 outer Quote 본문입니다.'),
  expect.stringContaining('두 번째 문단입니다.'),
]);
```

- [ ] **Step 7: Add the production detail-thread exclusion assertion**

In `PostDetailThreadRoute.play`, after the row-order assertion add:

```ts
expect(canvas.queryByText(/님에게 답글$/)).not.toBeInTheDocument();
```

The route fixtures now contain visible Parent Profiles, so this assertion protects the actual `PostDetailThread` caller rather than a missing-data shortcut.

- [ ] **Step 8: Run the focused Storybook test and verify the intended failure**

Run:

```bash
pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/Posts.stories.tsx
```

Expected: FAIL in `ProductionRepostQuoteListIntegration` because `Reply 대상 작성자님에게 답글` is not rendered. Type errors or missing fixture fields are not the intended failure and must be corrected before implementation.

---

### Task 3: Minimal shared attribution implementation

**Files:**

- Modify: `apps/app/src/components/post/PostListItem.tsx:1-267,334-388`
- Modify: `apps/app/src/components/post/PostDetailThread.tsx:272-277`
- Modify: `apps/app/src/stories/Posts.stories.tsx:2158-2190,2585-2605`

**Interfaces:**

- Consumes: `PostListItem_post.replyParent.profile.displayName`, `MessageCircle`, and existing Repost Link·Pressable subtree.
- Produces: `PostListItem({ post, showDivider?, showReplyAttribution? })`; private layout-only `PostAttributionRow({ icon, children })`; detailed callers pass `showReplyAttribution={false}`.

- [ ] **Step 1: Add imports and the Parent display name fragment**

Update imports:

```ts
import { MessageCircle } from 'lucide-react-native';
import { type ReactNode, useCallback, useRef, useState } from 'react';
```

Expand only the existing Parent subtree:

```graphql
replyParent {
  id
  profile {
    displayName
  }
}
```

Do not modify schema, resolver, route queries, or generated files by hand.

- [ ] **Step 2: Add the explicit list-surface prop**

Use this exact public component signature:

```ts
export function PostListItem({
  post: postKey,
  showDivider = true,
  showReplyAttribution = true,
}: {
  post: PostListItem_post$key;
  showDivider?: boolean;
  showReplyAttribution?: boolean;
}) {
```

The default preserves every current general-list caller. Only detailed thread callers opt out.

- [ ] **Step 3: Extract the layout-only attribution row**

Add a private component in `PostListItem.tsx`:

```tsx
function PostAttributionRow({ children, icon }: { children: ReactNode; icon: ReactNode }) {
  return (
    <View style={styles.attributionRow}>
      <View style={styles.attributionIconColumn}>{icon}</View>
      <View style={styles.attributionContent}>{children}</View>
    </View>
  );
}
```

It must not accept a relation variant, href, press handler, role, or accessibility label.

- [ ] **Step 4: Build the optional Reply attribution from normalized fragment data**

After `cardStyle`, compute:

```tsx
const replyAttribution =
  showReplyAttribution && post.replyParent ? (
    <PostAttributionRow
      icon={
        <View
          aria-hidden
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <MessageCircle color={theme.textSecondary} size={16} />
        </View>
      }
    >
      <Text numberOfLines={1} style={[styles.attributionLabel, { color: theme.textSecondary }]}>
        {post.replyParent.profile.displayName}님에게 답글
      </Text>
    </PostAttributionRow>
  ) : null;
```

Do not synthesize a Parent name or fallback when `replyParent` is `null`.

- [ ] **Step 5: Use the Reply attribution once in both contentful branches**

In the ordinary content branch:

```tsx
<View role="article" style={cardStyle}>
  {replyAttribution}
  <PostListRow onDeleted={onDeleted} post={post} reply={reply} />
</View>
```

In the Quote/Reply+Quote branch, move `cardStyle` to a non-interactive outer wrapper and retain the complete existing avatar, source presentation and action surface subtree inside `styles.quoteRow`:

```tsx
<View style={cardStyle}>
  {replyAttribution}
  <View style={styles.quoteRow}>
    <Link asChild href={profileHref}>
      <Pressable
        aria-hidden
        accessibilityElementsHidden
        accessible={false}
        focusable={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.avatar}
        tabIndex={-1}
      >
        <Avatar
          imageUri={post.profile.avatar?.url}
          label={post.profile.displayName || post.profile.handle}
          size={48}
        />
      </Pressable>
    </Link>
    <View style={styles.sourcePresentation}>
      <PostSourcePresentationView
        post={presentationPost}
        showPostAvatar={false}
        sourcePreviewStyle={styles.quoteSourcePreview}
      />
      <PostActionSurface
        actionBarStyle={styles.actionBarSlot}
        onDeleted={onDeleted}
        reactionSummaryStyle={styles.quoteReactionSummary}
        reply={reply}
        socialActionTarget={post.actionSurface!}
      />
    </View>
  </View>
</View>
```

Do not render `replyAttribution` inside Source preview or `PostListRow`.

Because the new non-interactive card wrapper adds exactly one ancestor above `styles.quoteRow`, update the existing production story's card lookup from:

```ts
const quoteCard = quoteRow!.parentElement!.parentElement!;
```

to:

```ts
const quoteCard = quoteRow!.parentElement!.parentElement!.parentElement!;
```

Do not weaken or remove the existing Quote border, Action Bar and Source geometry assertions.

- [ ] **Step 6: Render the existing Repost semantics through the same layout**

Replace only the outer Repost attribution layout with:

```tsx
<PostAttributionRow icon={<Text style={[styles.repeat, { color: theme.textSecondary }]}>↻</Text>}>
  <Link asChild href={profileHref}>
    <Pressable
      accessibilityLabel={`${post.profile.displayName} 프로필 보기`}
      accessibilityRole="link"
      style={styles.repostLabelTarget}
    >
      <Text numberOfLines={1} style={[styles.attributionLabel, { color: theme.textSecondary }]}>
        {post.profile.displayName}님이 재게시함
      </Text>
    </Pressable>
  </Link>
</PostAttributionRow>
```

Keep the existing contentless Repost guard and direct Source `PostListRow` unchanged.

- [ ] **Step 7: Rename only the shared layout styles**

Use:

```ts
attributionRow: {
  alignItems: 'center',
  flexDirection: 'row',
  gap: spacing.md,
  minWidth: 0,
},
attributionIconColumn: { alignItems: 'flex-end', width: 48 },
attributionContent: { flex: 1, minWidth: 0 },
attributionLabel: { fontFamily: 'SUIT', ...typography.sm },
```

Retain `repeat` and `repostLabelTarget`; remove only the replaced `repostAttribution`, `repostIconColumn`, `repostAuthorSlot`, and `repostLabel` names.

- [ ] **Step 8: Disable list attribution at both detailed thread call sites**

In production `PostDetailThread`, use:

```tsx
<PostListItem
  post={requireThreadFragment(item.post.listItem, `${role} list item`)}
  showDivider={false}
  showReplyAttribution={false}
/>
```

In fixture-only `ThreadCatalog`, use:

```tsx
<PostListItem
  post={requireFragment(item.post.listItem, 'thread list item')}
  showDivider={false}
  showReplyAttribution={false}
/>
```

Do not modify `PostLayout`, `PostThreadLayout`, connector metadata, pagination, or Reply Composer ownership.

- [ ] **Step 9: Regenerate Relay artifacts for verification**

Run:

```bash
pnpm --filter @kosmo/app relay
```

Expected: compiler succeeds with `replyParent.profile.displayName`. If it fails because the schema lacks that field, stop without modifying API/schema and return a scope decision packet.

- [ ] **Step 10: Run the focused Storybook test and verify it passes**

Run:

```bash
pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/Posts.stories.tsx
```

Expected: PASS, including ordinary Reply, Reply+Quote, Parent-null/general Post, detailed thread and existing Repost assertions.

- [ ] **Step 11: Verify generated artifacts are not part of the diff**

Run:

```bash
git status --short
git diff --name-only -- 'apps/app/src/**/__generated__'
```

Expected: no generated path is staged or included in the commit diff.

---

### Task 4: Full verification, independent review and implementation checkpoint

**Files:**

- Modify: `openspec/changes/show-post-list-reply-target/tasks.md`
- Review: all files listed in Tasks 2-3

**Interfaces:**

- Consumes: completed product/test diff and active OpenSpec decisions.
- Produces: independently reviewed implementation commit with tasks 1.2-1.4 checked, pushed Draft PR, hosted check evidence, and explicit platform gaps.

- [ ] **Step 1: Run App compiler and type checks**

Run:

```bash
pnpm --filter @kosmo/app check
```

Expected: Relay compiler and TypeScript pass.

- [ ] **Step 2: Run focused and full App tests**

Run in order:

```bash
pnpm --filter @kosmo/app exec vitest run --project=storybook src/stories/Posts.stories.tsx
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app build-storybook
pnpm --filter @kosmo/app test:storybook
```

Expected: all commands pass. Do not replace a failing relevant story with a broader snapshot update.

- [ ] **Step 3: Run scoped repository checks**

Run:

```bash
pnpm exec eslint apps/app/src/components/post/PostListItem.tsx apps/app/src/components/post/PostDetailThread.tsx apps/app/src/stories/fixtures.ts apps/app/src/stories/Posts.stories.tsx
pnpm exec prettier --check apps/app/src/components/post/PostListItem.tsx apps/app/src/components/post/PostDetailThread.tsx apps/app/src/stories/fixtures.ts apps/app/src/stories/Posts.stories.tsx docs/design/post-action-bar.md docs/design/post-thread.md openspec/changes/show-post-list-reply-target
./node_modules/.bin/openspec validate show-post-list-reply-target --strict
git diff --check
```

Expected: all pass and `git diff --check` prints nothing.

- [ ] **Step 4: Perform Web runtime verification at 390px and 600px**

Start the existing Storybook dev workflow and inspect `ProductionRepostQuoteListIntegration` and `PostDetailThreadRoute` in the in-app browser.

Verify at both widths:

- ordinary Reply and Reply+Quote show `Reply 대상 작성자님에게 답글` once per Post;
- icon column, 14/20 text line box and zero extra gap match Repost attribution;
- label is not clickable or focusable;
- long/available content does not introduce horizontal overflow;
- pure Repost link and Source row geometry remain unchanged;
- detailed thread rows show no Reply attribution and connectors/dividers remain unchanged.

Record Web viewport and observation. Record VoiceOver/TalkBack/iOS/Android runtime as not run unless actual devices or emulators were used.

- [ ] **Step 5: Dispatch the required independent implementation review**

Use configured `implementation_reviewer` with read-only scope:

- approved PROD-696/`show-post-list-reply-target` requirements;
- current working-tree diff only;
- correctness, Reply+Quote duplication, detail-thread leakage, Repost interaction regression, a11y duplication and verification gaps;
- no speculative new variants, API work, E2E expansion or redesign.

Require `REVIEW_PACKET_V1`. Fix actionable findings inside scope, rerun affected checks, and request a fresh review until verdict is `승인 가능`.

- [ ] **Step 6: Check OpenSpec implementation tasks 1.2-1.4**

After verification and review pass, change only:

```markdown
- [x] 1.2 일반 목록의 Reply 대상 attribution과 상세 thread 제외 동작을 구현한다.
- [x] 1.3 승인 동작과 기존 Repost·Quote 회귀를 직접 증명하는 최소 Storybook/컴포넌트 assertion을 추가한다.
- [x] 1.4 Relay compiler, App typecheck·관련 테스트, Storybook a11y, Web 수동 확인과 저장소 정적 검증을 수행하고 플랫폼별 검증 공백을 기록한다.
```

Leave task 1.5 unchecked until archive completes.

- [ ] **Step 7: Commit the implementation checkpoint**

Run the safe staging checks, then commit:

```bash
git add apps/app/src/components/post/PostListItem.tsx apps/app/src/components/post/PostDetailThread.tsx apps/app/src/stories/fixtures.ts apps/app/src/stories/Posts.stories.tsx openspec/changes/show-post-list-reply-target/tasks.md
git diff --cached --name-only
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-696 목록에 Reply 대상을 표시한다"
```

Expected: only product/test files and the OpenSpec task check update; no generated files.

- [ ] **Step 8: Push immediately and wait for required checks**

Run:

```bash
git push
```

Read GitHub checks, flat comments and review threads. Required checks must be green before archive. If a check fails, classify it from logs before editing; do not change PROD-696 code for an unrelated infrastructure failure.

- [ ] **Step 9: Synchronize the Draft PR body**

Update only the existing Draft PR body:

- mark implementation and Storybook items complete;
- add exact commands/results and Web 390px·600px observations;
- name independent review verdict;
- retain unrun Native runtime as an explicit gap;
- leave archive unchecked until Task 5 completes.

Do not post a separate comment, request review, or mark Ready.

---

### Task 5: Final contract sync, archive and handoff

**Files:**

- Modify through archive: `openspec/specs/post-reply-ui/spec.md`
- Move through archive: `openspec/changes/show-post-list-reply-target/**` → `openspec/changes/archive/2026-08-06-show-post-list-reply-target/**`
- Modify after archive: archived `tasks.md` task 1.5 checkbox

**Interfaces:**

- Consumes: verified implementation commit, green required checks, latest unchanged PROD-696/canonical authority, no Blocked decisions.
- Produces: archived canonical Reply-list contract, post-archive strict validation, final pushed Draft PR, and a separate user decision for Ready conversion.

- [ ] **Step 1: Re-read current authority before archive**

Fetch PROD-696 and comments read-only, then compare:

- exact copy and non-interactive behavior;
- general-list-only surface;
- detailed thread exclusion;
- no schema/visibility/candidate-policy expansion;
- PROD-696 ownership of implementation, verification and archive.

If authority changed, stop before archive and return to the appropriate canonical/Linear/OpenSpec gate.

- [ ] **Step 2: Revalidate the active change**

Run:

```bash
./node_modules/.bin/openspec validate show-post-list-reply-target --strict
git status --short
```

Expected: valid active change and clean working tree after the implementation checkpoint.

- [ ] **Step 3: Archive with the repository OpenSpec workflow**

Invoke `openspec-archive-change`. It must sync the `post-reply-ui` delta into canonical specs, move the full change under `openspec/changes/archive/2026-08-06-show-post-list-reply-target/`, and preserve proposal/design/decisions/tasks/implementation plan.

- [ ] **Step 4: Mark the archive task complete in the archived checklist**

Change only the archived task:

```markdown
- [x] 1.5 최신 canonical·Linear와 구현·delta spec 정합성을 대조하고 change를 archive한 뒤 strict validation을 다시 통과시킨다.
```

- [ ] **Step 5: Run post-archive validation**

Run:

```bash
./node_modules/.bin/openspec validate --all --strict
pnpm exec prettier --check openspec/specs/post-reply-ui/spec.md openspec/changes/archive/2026-08-06-show-post-list-reply-target
git diff --check
```

Expected: all active and archived specs validate, formatting passes, no whitespace errors.

- [ ] **Step 6: Commit and push the archive checkpoint**

Run the safe staging checks, then commit and push:

```bash
git add openspec/specs/post-reply-ui/spec.md openspec/changes/show-post-list-reply-target openspec/changes/archive/2026-08-06-show-post-list-reply-target
git diff --cached --name-only
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-696 Reply 대상 표시 계약을 archive한다"
git push
```

If the active change path no longer exists after the move, `git add` records its deletion; do not recreate it.

- [ ] **Step 7: Wait for final required checks and update the Draft PR body**

Required checks must be green on the archive commit. Update the Draft PR body to include:

- implementation result and exact changed behavior;
- local and hosted verification results;
- canonical spec sync and archive validation;
- Web observations and unrun Native runtime gap;
- no unresolved review findings or threads affecting scope.

- [ ] **Step 8: Stop for the separate Ready decision**

Present the final diff, checks, review state, archive result and remaining Native runtime gap. Ask the user before changing Draft → Ready. Do not merge, close, resolve threads, request review, or complete Linear without separate approval and resulting-state readback.
