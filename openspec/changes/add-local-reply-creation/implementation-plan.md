# PROD-425 Reply Composition Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 목록과 상세 caller가 행별 Reply controller를 조립하지 않아도 `PostListItem`과 `PostLayout`이 기존 Reply action과 Composer surface를 내부 조립하게 하고, Web Reply editor에는 하나의 둥근 focus indicator만 남긴다.

**Architecture:** collection·thread 단위의 필수 `PostReplyCoordinatorProvider`가 selected Profile, surface owner, 단일 active Parent와 dirty·pending 전환 명령만 소유한다. 각 Post 표현부는 `usePostReplyBinding(post.id)`으로 coordinator를 소비하고, 기존 `ReplyComposerSurface`와 `PostActionBar` 계약을 그대로 조립한다. Provider 부재는 프로그래밍 오류로 드러내고, guest는 Provider 안의 `profile: null`로 명시한다. Web `TextArea`의 브라우저 기본 outline은 `PostComposer` 안에서만 제거하고, `editorSurface`의 기존 둥근 focus/error border를 유일한 시각적 입력 상태 경계로 유지한다.

**Tech Stack:** React 19, React Native/React Native Web, React Relay, TypeScript, Node test runner, React Test Renderer, Storybook/Vitest, OpenSpec

## Global Constraints

- modal·fullscreen·inline geometry, Parent/Quote presentation, action 순서와 copy를 변경하지 않는다.
- Web Reply editor는 브라우저 기본 사각 outline을 중복 표시하지 않고 기존 `editorSurface`의 둥근 primary focus border와 danger error border를 유지한다.
- Content 없는 display Repost의 Reply action은 disabled이고 callback·Composer·mutation에 진입하지 않는다. Repost action의 direct Source target은 유지한다.
- 한 collection 또는 thread에서 하나의 direct Parent만 active 상태가 될 수 있다.
- dirty 확인, pending close/Parent 전환 차단, 실패 입력 유지, 성공 close·focus 복원, 약 3초 snackbar와 수동 `보기`를 유지한다.
- 상세 성공 callback은 현재 detail query의 targeted refetch를 정확히 한 번 시작한다. 자동 이동, 목록 connection 합성, pagination membership 합성을 추가하지 않는다.
- `PostComposer`가 소유하는 Profile·Relay Environment·Parent별 draft/pending/error와 늦은 callback 격리를 변경하지 않는다.
- API, GraphQL schema, dependency, Notification 코드는 변경하지 않는다. canonical 문서는 승인된 focus 표현을 기록하는 `docs/design/reply-composer.md`만 변경한다.
- generated Relay artifact는 생성될 수 있지만 stage·commit하지 않는다.
- `.superpowers/**`와 `docs/superpowers/**`는 생성·stage·commit하지 않는다.
- Web 자동화와 Storybook screenshot은 현재 PR의 증거로 남기되, Android·iOS runtime 검증을 수행했다고 주장하지 않는다.

## File Map

- Create `apps/app/src/components/post/PostReplyCoordinator.tsx`: collection/thread 단위 Reply coordination Context와 Post별 binding hook.
- Create `apps/app/src/components/post/PostReplyCoordinator.test.ts`: Provider 누락, guest, list single-active, detail close-gated Parent 전환 단위 테스트.
- Modify `apps/app/src/components/post/PostListItem.tsx`: 외부 `reply` prop을 제거하고 coordinator binding으로 Reply action/surface를 내부 조립.
- Modify `apps/app/src/components/post/PostLayout.tsx`: 외부 `reply` prop을 제거하고 detail 표현부에서 coordinator binding을 내부 조립.
- Modify `apps/app/src/components/post/PostList.tsx`: 행별 controller 조립을 제거하고 list Provider를 한 번 배치.
- Modify `apps/app/src/components/bookmark/BookmarkList.tsx`: 행별 controller 조립을 제거하고 bookmark collection Provider를 한 번 배치.
- Modify `apps/app/src/components/post/PostDetailThread.tsx`: active Parent/ref 상태를 Provider로 옮기고 thread renderer는 Post 표현부만 선택.
- Modify `apps/app/src/stories/Posts.stories.tsx`: standalone Post story의 explicit guest Provider와 production coordinator 기반 Reply stories/interaction assertions.
- Modify `apps/app/src/components/post/PostComposer.tsx`: Web Reply editor의 브라우저 기본 outline만 제거하고 기존 wrapper focus/error border를 유지.
- Modify `docs/design/reply-composer.md`: Web editor의 단일 focus indicator 계약 기록.
- Modify `openspec/changes/add-local-reply-creation/decisions.md`: 사용자 승인 focus 표현과 대안·결과 기록.
- Modify `openspec/changes/add-local-reply-creation/tasks.md`: 전체 검증 뒤 task 2.2 완료 표시.
- Keep `apps/app/src/components/post/ReplyComposerSurface.tsx`, `replySurface.ts`, GraphQL documents, generated artifacts unchanged.

---

### Task 1: Reply coordinator contract와 상태 전환을 고정한다

**Files:**

- Create: `apps/app/src/components/post/PostReplyCoordinator.tsx`
- Create: `apps/app/src/components/post/PostReplyCoordinator.test.ts`

**Interfaces:**

- Consumes: `ReplyComposerSurface_profile$key`, `ReplyComposerSurfaceHandle`, `PostComposerCreatedPost`.
- Produces:

```ts
export type PostReplyOwner = 'detail' | 'list';

export type PostReplyBinding = {
  expanded: boolean;
  onPostCreated: ((post: PostComposerCreatedPost) => void) | undefined;
  onPress: () => void;
  onRequestClose: () => void;
  owner: PostReplyOwner;
  profile: ReplyComposerSurface_profile$key;
  surfaceRef?: RefObject<ReplyComposerSurfaceHandle | null>;
};

export function PostReplyCoordinatorProvider(
  props: PropsWithChildren<{
    onPostCreated?: (post: PostComposerCreatedPost) => void;
    owner: PostReplyOwner;
    profile: ReplyComposerSurface_profile$key | null;
  }>,
): React.JSX.Element;

export function usePostReplyBinding(postId: string): PostReplyBinding | null;
```

- [x] **Step 1: Provider 경계와 전환을 검증하는 실패 테스트를 작성한다**

`PostReplyCoordinator.test.ts`에서 React Test Renderer probe 두 개로 hook 결과를 관찰한다.

```ts
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { ReplyComposerSurface_profile$key } from './__generated__/ReplyComposerSurface_profile.graphql';
import {
  PostReplyCoordinatorProvider,
  usePostReplyBinding,
  type PostReplyBinding,
} from './PostReplyCoordinator';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const profile = {} as ReplyComposerSurface_profile$key;
const bindings = new Map<string, PostReplyBinding | null>();
let renderer: ReactTestRenderer | null = null;

function Probe({ postId }: { postId: string }) {
  bindings.set(postId, usePostReplyBinding(postId));
  return null;
}

afterEach(async () => {
  bindings.clear();
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
});
```

아래 네 assertion 묶음을 각각 독립 test로 둔다.

1. Provider 밖의 `Probe` render는 `PostReplyCoordinatorProvider가 필요합니다` 오류를 낸다.
2. `profile={null}` Provider 안의 binding은 `null`이고 Reply action을 만들 수 없다.
3. `owner="list"`에서 A를 누르면 A만 expanded, B를 누르면 B만 expanded, B를 다시 누르면 모두 closed다.
4. `owner="detail"`에서 A의 `surfaceRef.current.requestClose`가 callback을 보관하면 B를 눌러도 A가 유지되고, 그 callback을 실행한 뒤에만 B가 expanded다. callback을 실행하지 않는 pending stub에서는 Parent가 바뀌지 않는다.

- [x] **Step 2: 새 module이 없어서 테스트가 실패하는지 확인한다**

Run:

```bash
pnpm --filter @kosmo/app exec node --experimental-test-module-mocks \
  --import tsx --test src/components/post/PostReplyCoordinator.test.ts
```

Expected: FAIL — `PostReplyCoordinator` module을 찾을 수 없다.

- [x] **Step 3: 최소 coordinator와 binding hook을 구현한다**

`PostReplyCoordinator.tsx`에 `undefined` sentinel Context를 만들고 다음 상태 흐름을 구현한다.

```ts
const PostReplyCoordinatorContext = createContext<PostReplyCoordinatorValue | undefined>(
  undefined,
);

export function PostReplyCoordinatorProvider({
  children,
  onPostCreated,
  owner,
  profile,
}: PostReplyCoordinatorProviderProps) {
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const activeSurfaceRef = useRef<ReplyComposerSurfaceHandle>(null);

  useEffect(() => {
    if (profile === null) {
      setActivePostId(null);
    }
  }, [profile]);

  const close = useCallback(() => setActivePostId(null), []);
  const press = useCallback(
    (postId: string) => {
      if (owner === 'list') {
        setActivePostId((current) => (current === postId ? null : postId));
        return;
      }
      if (activePostId === null) {
        setActivePostId(postId);
        return;
      }
      activeSurfaceRef.current?.requestClose(
        activePostId === postId ? undefined : () => setActivePostId(postId),
      );
    },
    [activePostId, owner],
  );

  return (
    <PostReplyCoordinatorContext.Provider
      value={{ activePostId, activeSurfaceRef, close, onPostCreated, owner, press, profile }}
    >
      {children}
    </PostReplyCoordinatorContext.Provider>
  );
}
```

`usePostReplyBinding(postId)`은 모든 hook을 조건 없이 호출한 뒤 다음 순서로 값을 반환한다.

1. Context가 `undefined`이면 명시적 programming error를 throw한다.
2. `profile === null`이면 guest binding `null`을 반환한다.
3. `expanded = activePostId === postId`를 계산한다.
4. detail의 active Post에만 `activeSurfaceRef`를 노출한다.
5. `onPress`는 `press(postId)`, `onRequestClose`는 `close`를 호출한다.

- [x] **Step 4: coordinator 단위 테스트와 TypeScript를 통과시킨다**

Run:

```bash
pnpm --filter @kosmo/app exec node --experimental-test-module-mocks \
  --import tsx --test src/components/post/PostReplyCoordinator.test.ts
pnpm --filter @kosmo/app check
```

Expected: coordinator tests PASS, Relay compiler와 TypeScript PASS. 새 GraphQL document와 dependency diff는 없음.

- [x] **Step 5: coordinator checkpoint를 경로 지정으로 commit하고 즉시 push한다**

```bash
git add apps/app/src/components/post/PostReplyCoordinator.tsx \
  apps/app/src/components/post/PostReplyCoordinator.test.ts
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-425 Reply coordinator 경계를 추가한다"
git push origin prod-425
```

Expected: 금지 경로 출력 없음. OpenSpec과 다른 사용자 diff는 stage되지 않는다.

---

### Task 2: Post 표현부가 Reply UI를 내부 조립하게 한다

**Files:**

- Modify: `apps/app/src/components/post/PostListItem.tsx`
- Modify: `apps/app/src/components/post/PostLayout.tsx`
- Modify: `apps/app/src/components/post/PostList.tsx`
- Modify: `apps/app/src/components/bookmark/BookmarkList.tsx`
- Modify: `apps/app/src/components/post/PostDetailThread.tsx`
- Modify: `apps/app/src/stories/Posts.stories.tsx`

**Interfaces:**

- Consumes: Task 1의 `PostReplyCoordinatorProvider`와 `usePostReplyBinding(postId)`.
- Produces: `PostListItem({ post })`와 `PostLayout({ post })`; 외부 `reply` prop과 `PostListItemReplyController` export 없음.
- Preserves: `ReplyComposerSurface` props, `PostActionBarProps['reply']`, detail `onReplyCreated`, contentless Repost eligibility.

- [x] **Step 1: production ownership을 사용하는 Storybook 실패 상태를 먼저 만든다**

`Posts.stories.tsx`의 meta에 standalone Post 표현부를 위한 explicit guest decorator를 추가한다.

```tsx
decorators: [
  (Story) => (
    <PostReplyCoordinatorProvider owner="list" profile={null}>
      <Story />
    </PostReplyCoordinatorProvider>
  ),
],
```

`ReplyDetailInlineStory`의 local `expanded` state와 `reply={{ ... }}`를 제거하고 다음처럼 detail Provider를 사용한다.

```tsx
function ReplyDetailInlineStory() {
  const data = usePostsStoryData();
  const post = requireFragment(
    requirePostById(data.posts, shortPost.id).layout,
    'Reply detail inline Post',
  );

  return (
    <PostReplyCoordinatorProvider owner="detail" profile={data.replyComposerProfile}>
      <Catalog>
        <PostLayout post={post} />
      </Catalog>
    </PostReplyCoordinatorProvider>
  );
}
```

- [x] **Step 2: Post 표현부가 아직 Context를 소비하지 않아 story가 실패하는지 확인한다**

Run:

```bash
pnpm --filter @kosmo/app exec vitest run --project=storybook \
  -t "ReplyDetailInlineIntegration"
```

Expected: FAIL — detail story에서 이름 `답글` action 또는 inline textbox를 찾을 수 없다.

- [x] **Step 3: `PostListItem`과 `PostLayout` 안에서 binding을 소비한다**

두 컴포넌트에서 `reply` prop과 `PostListItemReplyController` type을 제거하고 fragment로 읽은 display Post ID로 binding을 구한다.

```tsx
export function PostListItem({ post: postKey }: { post: PostListItem_post$key }) {
  const post = useFragment(PostListItemFragment, postKey);
  const replyBinding = usePostReplyBinding(post.id);
  const replyTriggerRef = useRef<View>(null);
  const reply = replyBinding
    ? {
        accessibilityLabel: '답글',
        controlRef: replyTriggerRef,
        expanded: replyBinding.expanded,
        onPress: replyBinding.onPress,
        processing: getReplyProcessingState(true, Boolean(post.content)),
      }
    : undefined;
```

`ReplyComposerSurface`에는 기존과 같은 props를 binding에서 전달한다.

```tsx
<ReplyComposerSurface
  ref={replyBinding.surfaceRef}
  onPostCreated={replyBinding.onPostCreated}
  onRequestClose={replyBinding.onRequestClose}
  open={replyBinding.expanded}
  owner={replyBinding.owner}
  parent={post.replySurface}
  profile={replyBinding.profile}
  triggerRef={replyTriggerRef}
/>
```

`PostLayout`에도 같은 binding을 적용하되 기존 `styles.replySurface` wrapper와 detail geometry는 유지한다. 두 컴포넌트 모두 Reply eligibility를 display Post의 `Boolean(post.content)`로 계산하며 Source Content로 다시 계산하지 않는다.

- [x] **Step 4: list, bookmark, thread에 collection 단위 Provider를 한 번씩 배치한다**

`PostList`와 `BookmarkList`에서 `activeReplyPostId`, Profile null reset effect, 행별 `reply={{ ... }}`를 제거한다. 실제 Post subtree를 다음 Provider로 감싼다.

```tsx
<PostReplyCoordinatorProvider owner="list" profile={replyProfile ?? null}>
  {/* 기존 목록/ScrollView와 PostListItem들 */}
</PostReplyCoordinatorProvider>
```

`PostDetailThreadContent`에서 `activeReplyPostId`와 `activeReplySurfaceRef`를 제거하고 frame/thread subtree를 다음 Provider로 감싼다.

```tsx
<PostReplyCoordinatorProvider
  onPostCreated={onReplyCreated}
  owner="detail"
  profile={replyProfile ?? null}
>
  <PostDetailFrame header={header} nativeScrollProps={nativeScrollProps}>
    <PostThreadLayout
      ancestors={ancestors}
      current={current}
      descendants={descendants}
      renderPost={({ item, role }) =>
        role === 'current' ? (
          <PostLayout post={requireThreadFragment(item.post.detail, 'current detail')} />
        ) : (
          <PostListItem post={requireThreadFragment(item.post.listItem, `${role} list item`)} />
        )
      }
    />
  </PostDetailFrame>
</PostReplyCoordinatorProvider>
```

현재 `PostDetailThread`의 `key={identity}` remount 경계는 그대로 두어 route identity가 바뀌면 coordinator도 함께 초기화한다. `onReplyCreated`는 Provider에만 한 번 전달하고 Post row에서 별도 callback을 만들지 않는다.

- [x] **Step 5: 가장 가까운 interaction 회귀 묶음을 통과시킨다**

Run:

```bash
pnpm --filter @kosmo/app exec node --experimental-test-module-mocks \
  --import tsx --test src/components/post/PostReplyCoordinator.test.ts
pnpm --filter @kosmo/app exec vitest run --project=storybook \
  -t "Reply(ListSurfaceIntegration|DetailInlineIntegration|DetailInlinePendingLifecycle|ListSurfaceSuccessLifecycle)"
pnpm --filter @kosmo/app check
```

Expected:

- 목록 contentful Reply는 modal/fullscreen으로 열리고 contentless Repost action은 disabled다.
- 상세는 dialog 없이 한 행만 inline으로 열린다.
- pending 동안 다른 Parent와 같은 Parent 재활성화가 현재 surface를 닫지 않는다.
- 성공 뒤 surface가 닫히고 trigger focus와 snackbar/`보기` navigation이 유지된다.
- detail success callback은 기존 route story에서 한 번만 관찰된다.

- [x] **Step 6: UI ownership checkpoint를 경로 지정으로 commit하고 즉시 push한다**

```bash
git add apps/app/src/components/post/PostListItem.tsx \
  apps/app/src/components/post/PostLayout.tsx \
  apps/app/src/components/post/PostList.tsx \
  apps/app/src/components/bookmark/BookmarkList.tsx \
  apps/app/src/components/post/PostDetailThread.tsx \
  apps/app/src/stories/Posts.stories.tsx
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-425 Reply 조립 소유권을 Post 표현부로 옮긴다"
git push origin prod-425
```

Expected: caller의 행별 Reply config와 `PostListItemReplyController`가 사라지고 금지 경로·generated Relay artifact가 stage되지 않는다.

---

### Task 3: OpenSpec과 전체 검증 증거를 동기화한다

**Files:**

- Modify: `openspec/changes/add-local-reply-creation/decisions.md`
- Modify: `openspec/changes/add-local-reply-creation/design.md`
- Modify: `openspec/changes/add-local-reply-creation/tasks.md`
- Keep: `openspec/changes/add-local-reply-creation/implementation-plan.md`

**Interfaces:**

- Consumes: Task 1·2의 구현과 자동화 결과.
- Produces: PROD-425 task 2.2 완료 증거. OpenSpec 전체 archive 결정은 PROD-432 및 남은 slice 소유자에게 유지한다.

- [x] **Step 1: 구조 잔여물을 정적으로 검색한다**

Run:

```bash
rg -n "PostListItemReplyController" \
  apps/app/src/components/post \
  apps/app/src/components/bookmark \
  apps/app/src/stories/Posts.stories.tsx
rg -nUP "<(?:PostListItem|PostLayout)[^>]*\breply=" \
  apps/app/src/components/post \
  apps/app/src/components/bookmark \
  apps/app/src/stories/Posts.stories.tsx
```

Expected: caller-owned `PostListItemReplyController`와 `PostListItem`/`PostLayout`의 행별 `reply` prop 결과 없음. `PostActionBar` 내부의 domain `reply` config는 제거 대상이 아니다.

- [x] **Step 2: 전체 app과 OpenSpec 검증을 실행한다**

Run:

```bash
pnpm --filter @kosmo/app test
pnpm exec openspec validate add-local-reply-creation --strict
pnpm exec prettier --check \
  openspec/changes/add-local-reply-creation/decisions.md \
  openspec/changes/add-local-reply-creation/design.md \
  openspec/changes/add-local-reply-creation/tasks.md \
  openspec/changes/add-local-reply-creation/implementation-plan.md
git diff --check
```

Expected: Relay/TypeScript, unit, Storybook build/interaction, OpenSpec strict validation, Prettier와 whitespace 검사 모두 PASS.

- [x] **Step 3: Web 시각 증거를 캡처한다**

Run:

```bash
pnpm --filter @kosmo/app exec storybook dev -p 6007 --disable-telemetry --host 127.0.0.1
```

아래 story URL을 in-app browser에서 열고 interaction이 종료된 뒤 `답글` action을 한 번 활성화한다.

```text
http://127.0.0.1:6007/iframe.html?id=kosmo-content-posts--reply-list-surface-integration&viewMode=story
http://127.0.0.1:6007/iframe.html?id=kosmo-content-posts--reply-detail-inline-integration&viewMode=story
```

각 viewport를 story global 값 그대로 유지하고 screenshot을 아래 절대 경로에 저장한다.

```text
/Users/sasha_/.codex/visualizations/2026/07/29/019fae82-f2fb-7f23-be6f-1dc86b0c3402/prod-425-reply-list-modal.png
/Users/sasha_/.codex/visualizations/2026/07/29/019fae82-f2fb-7f23-be6f-1dc86b0c3402/prod-425-reply-detail-inline.png
```

다음 두 화면을 사용자 보고에 첨부한다.

1. 넓은 Web 목록의 Parent가 보이는 600×`min(720px, 85dvh)` modal.
2. 상세 thread의 direct Parent 행 아래 inline Composer.

두 screenshot은 사용자 보고에 첨부한다. 레이아웃 변경이 관찰되면 완료로 처리하지 않고 Task 2 diff와 기존 story expectation을 다시 대조한다.

- [x] **Step 4: 구현 증거가 모두 통과한 뒤 OpenSpec task 2.2를 완료한다**

`tasks.md`에서 ownership 이동을 설명하는 `2.2`만 `[x]`로 바꾼다. PROD-423 통합 검증, PROD-426 Notification, 전체 change archive task는 현재 PR에서 완료 처리하지 않는다.

- [x] **Step 5: OpenSpec checkpoint를 경로 지정으로 commit하고 즉시 push한다**

```bash
git add openspec/changes/add-local-reply-creation/decisions.md \
  openspec/changes/add-local-reply-creation/design.md \
  openspec/changes/add-local-reply-creation/tasks.md \
  openspec/changes/add-local-reply-creation/implementation-plan.md
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-425 Reply ownership 명세를 동기화한다"
git push origin prod-425
```

Expected: OpenSpec change는 전체 범위가 남아 `in-progress`이며, PROD-425 담당 task만 완료 상태로 돌아간다.

---

### Task 4: 독립 리뷰와 PR 상태를 확인한다

**Files:**

- Review only: `origin/main...origin/prod-425`, 현재 OpenSpec, 관련 tests/stories.
- No automatic PR comment, review reply, Ready 전환, merge 또는 close.

**Interfaces:**

- Consumes: push된 세 checkpoint와 hosted CI 결과.
- Produces: `REVIEW_PACKET_V1` 독립 리뷰 결과와 사용자에게 보여줄 GitHub communication 초안.

- [ ] **Step 1: GitHub CI가 현재 remote HEAD에서 완료됐는지 확인한다**

Run:

```bash
gh pr checks 413 --watch
```

Expected: required checks PASS. 실패하면 로그를 조사해 승인 범위 안의 회귀만 수정하고, 외부 서비스 또는 범위 확대 문제는 사용자에게 보고한다.

- [ ] **Step 2: Sol medium `implementation_reviewer`에게 독립 리뷰를 요청한다**

리뷰 범위는 ownership 이동, 단일 active Parent, dirty/pending 전환, guest/Provider 누락, contentless Repost, focus/callback/refetch, OpenSpec 정합성과 검증 공백이다. 리뷰어는 코드를 수정하지 않고 `REVIEW_PACKET_V1`만 반환한다.

- [ ] **Step 3: finding이 없으면 GitHub 후속 communication 초안을 사용자에게 보여준다**

초안에는 controller가 PROD-425에서 도입된 구조였고, 이번 변경이 composition ownership만 Post 표현부로 옮겼으며 관찰 가능한 동작과 테스트가 유지됐다는 내용을 포함한다. 사용자 승인 전에는 reviewer mention, PR comment, review reply, thread resolve나 PR 상태 변경을 실행하지 않는다.

---

### Task 5: Web Reply editor의 focus 경계를 하나로 정리한다

**Files:**

- Modify: `apps/app/src/stories/Posts.stories.tsx`
- Modify: `apps/app/src/components/post/PostComposer.tsx`
- Modify: `docs/design/reply-composer.md`
- Modify: `openspec/changes/add-local-reply-creation/decisions.md`
- Modify: `openspec/changes/add-local-reply-creation/implementation-plan.md`

**Interfaces:**

- Consumes: 기존 `PostComposer`의 `editorFocused` state와 `editorSurface` primary/danger border.
- Produces: Web `<textarea>`의 computed `outlineStyle: none`; focus는 기존 둥근 `editorSurface` border로 계속 식별된다.
- Preserves: Native 입력 스타일, 공용 `TextArea`, modal·inline geometry, focus 이동·복원, validation/error와 submit lifecycle.

- [x] **Step 1: 중복 사각 outline을 검출하는 실패 Storybook assertion을 작성한다**

`ReplyDetailInlineIntegration`에서 Reply editor가 열린 뒤 textbox focus와 computed outline을 검증하고,
`ComposerDefault`에서는 일반 Post editor의 browser outline이 유지되는지 확인한다.

```tsx
const body = canvas.getByRole('textbox', { name: '답글 본문' });
await waitFor(() => expect(body).toHaveFocus());
expect(getComputedStyle(body).outlineStyle).toBe('none');
```

```tsx
expect(getComputedStyle(body).outlineStyle).not.toBe('none');
```

두 assertion은 기존 story에 추가하며 새 fixture, helper, test ID를 만들지 않는다.

- [x] **Step 2: 현재 브라우저 outline 때문에 테스트가 실패하는지 확인한다**

Run:

```bash
pnpm --filter @kosmo/app exec vitest run --project=storybook \
  src/stories/Posts.stories.tsx -t "Reply Detail Inline Integration"
```

Expected: FAIL — focused `답글 본문`의 computed `outlineStyle`이 `auto`이고 기대값은 `none`이다.

- [x] **Step 3: `PostComposer`의 Web editor에만 기본 outline 제거 스타일을 적용한다**

`PostComposer.tsx`에서 공용 `TextArea`에 전달하는 기존 `styles.editor`는 유지하고 Web에서만 다음 style을 추가한다.

```tsx
style={[styles.editor, Platform.OS === 'web' && replyMode ? styles.webEditor : null]}
```

```tsx
webEditor: { outlineStyle: 'none' as never },
```

`editorSurface`의 `error ? theme.danger : editorFocused ? theme.primary : theme.border` 분기와 `borderWidth: 1`은 변경하지 않는다. 일반 Post composer, 공용 `TextField.tsx`와 Native style은 수정하지 않는다.

- [x] **Step 4: canonical·decision 문서를 승인된 시각 계약과 동기화한다**

`docs/design/reply-composer.md`의 editor 계약에 Web TextArea 기본 outline을 중복 표시하지 않고 둥근 `editorSurface` border 하나로 focus를 표현하며 error에서는 danger border를 사용한다고 기록한다.

`decisions.md`에는 2026-07-31 사용자 결정을 추가한다: 사각 browser outline만 제거하고 wrapper focus/error border를 유지한다. focus 표시 전체 제거와 Composer 외곽 border 이동은 각각 접근성 약화와 잘못된 범위 강조 때문에 선택하지 않았다.

- [x] **Step 5: focused·전체 app·OpenSpec 검증을 통과시킨다**

Run:

```bash
pnpm --filter @kosmo/app exec vitest run --project=storybook \
  src/stories/Posts.stories.tsx -t "Reply Detail Inline Integration"
pnpm --filter @kosmo/app test
pnpm exec openspec validate add-local-reply-creation --strict
pnpm exec prettier --check \
  apps/app/src/components/post/PostComposer.tsx \
  apps/app/src/stories/Posts.stories.tsx \
  docs/design/reply-composer.md \
  openspec/changes/add-local-reply-creation/decisions.md \
  openspec/changes/add-local-reply-creation/implementation-plan.md
git diff --check
```

Expected: focused Storybook, Relay/TypeScript, unit, Storybook build/interaction, OpenSpec strict validation, formatting과 whitespace 검사가 모두 PASS한다. Web runtime computed style에서 textarea outline은 `none`, editor wrapper focus border는 유지된다.

- [x] **Step 6: 독립 리뷰 뒤 경로 지정 commit·push한다**

Sol medium `implementation_reviewer`가 Web-only 범위, focus indicator 보존, error/Native/공용 TextArea 비변경과 문서·테스트 정합성을 확인한 뒤 아래 경로만 stage한다.

```bash
git add apps/app/src/components/post/PostComposer.tsx \
  apps/app/src/stories/Posts.stories.tsx \
  docs/design/reply-composer.md \
  openspec/changes/add-local-reply-creation/decisions.md \
  openspec/changes/add-local-reply-creation/implementation-plan.md
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-425 Reply editor 포커스 경계를 정리한다"
git push origin prod-425
```

Expected: PR #413의 기존 modal·inline 동작과 OpenSpec 16/21 `in-progress` 상태를 유지하면서 Web editor의 중복 outline만 제거된다.

## Test Scope

- 테스트 코드 범위: `PostReplyCoordinator.test.ts`의 Provider/guest/single-active/close-gated transition과 기존 `Posts.stories.tsx` Reply interaction의 coordinator 소비 경로, focused Web Reply textbox computed outline assertion 및 일반 Post composer의 outline 비회귀 assertion.
- 테스트 필요성: optional caller prop 누락 재발, row별 state 분산, dirty/pending Parent 전환 손실, callback/refetch 중복, Reply browser outline 재도입과 일반 composer 범위 확장을 직접 방지한다.
- 테스트 제외 범위: `ReplyComposerSurface` geometry/lifecycle의 중복 unit test, 새로운 fixture/helper/test ID/harness, 공용 `TextArea`·unrelated Post/Reaction/Repost coverage, API E2E, Android·iOS runtime 자동화.

## Explicit Exclusions

- `ReplyComposerSurface`와 `PostComposer`의 UI·상태 로직 재작성.
- Context를 app root 또는 route 전역에 두는 일반화.
- row별 Provider, 전역 modal store, navigation state로 active Parent 관리.
- 새로운 guest 로그인 동작, toast duration/target 변경, Native 출시 판단.
- Relay connection updater, 새 Reply edge 합성, schema·mutation·Notification 변경.
- OpenSpec archive와 PROD-432가 소유한 최종 Action Bar 통합 완료 처리.
