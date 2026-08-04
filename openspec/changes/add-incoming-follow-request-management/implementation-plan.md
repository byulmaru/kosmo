# 받은 팔로우 요청 관리 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: 현재 세션에서 `superpowers:executing-plans`와 `superpowers:test-driven-development`를 사용해 task별 RED → GREEN → REFACTOR를 수행한다. 이 계획은 PROD-566 slice만 구현하며 PROD-654 navigation slice를 포함하지 않는다.

**Goal:** 인증된 사용자가 protected `/follow-requests` route에서 현재 selected Profile의 받은 pending 팔로우 요청을 조회하고 승인·거절하며 실패와 Profile 전환에서도 복구 가능한 상태를 유지하게 한다.

**Architecture:** Expo Router route가 `currentSession.selectedProfile` query와 actor revision 경계를 소유하고, Profile-colocated Relay pagination fragment가 목록을 소유한다. 각 요청 행은 requester presentation과 행별 mutation state를 소유하며, 서버 성공 payload의 삭제 ID만 현재 actor connection에서 제거한다. Web document scroll과 Native `ScrollView` metrics는 작은 순수 helper를 공유해 자동 pagination을 중복 없이 구동한다.

**Tech Stack:** Expo Router, React Native / React Native Web, React Relay 21, Relay Runtime, Node test runner, React Test Renderer, Storybook 10 + Vitest Browser.

## Global Constraints

- 구현 대상은 OpenSpec task 1.1–2.4와 Linear PROD-566뿐이다. task 3.x의 full sidebar, compact rail, mobile drawer, `UserRoundPlus`는 PROD-654에 남긴다.
- 공통 `PageHeader`의 제목은 `팔로워 요청`이며 loading, error, profile-required, empty, content 상태 모두 같은 header를 유지한다.
- 요청 목록은 selected Profile의 nullable `incomingProfileFollowRequests`만 사용하고 root query나 다른 Profile connection을 만들지 않는다.
- requester가 null인 request를 숨기지 않고 `확인할 수 없는 프로필`과 `거절`만 제공한다. 요청 시각은 조회하거나 표시하지 않는다.
- mutation 시작 시 행을 제거하지 않는다. 서버 성공 뒤 payload의 `profileFollowRequestId`로 현재 actor connection의 정확한 edge와 request record만 제거한다.
- 행별 pending/error만 사용하고, selected Profile 전환은 새 Relay Environment와 route remount로 이전 목록·pagination·local state·늦은 응답을 격리한다.
- API schema, core service, DB/migration, outgoing FollowButton, Notification, mobile bottom tab, `/menu`, dependency는 변경하지 않는다.
- generated Relay artifact는 생성해 검사하되 commit하지 않는다.
- `.superpowers/**`와 `docs/superpowers/**`는 만들거나 commit하지 않는다.

---

## File Map

- Create `apps/app/src/app/(tabs)/(protected)/follow-requests.tsx`: protected route query, actor revision key, initial loading/error/profile-required boundary.
- Create `apps/app/src/components/follow-request/FollowRequestList.tsx`: Profile pagination fragment, common header, empty/content/pagination states, Web/Native automatic pagination orchestration.
- Create `apps/app/src/components/follow-request/FollowRequestListItem.tsx`: requester fragment, Profile link, unavailable fallback, approve/reject mutations, row-local pending/error/retry.
- Create `apps/app/src/components/follow-request/followRequestStore.ts`: exact current-connection edge and request record removal helper.
- Create `apps/app/src/components/follow-request/followRequestPagination.ts`: pure near-end metric and Native handler helpers.
- Create `apps/app/src/components/follow-request/FollowRequestRoute.test.ts`: route query retry, selected Profile handoff, actor revision remount behavior.
- Create `apps/app/src/components/follow-request/followRequestStore.test.ts`: exact edge removal and actor Store isolation with real Relay Runtime records.
- Create `apps/app/src/components/follow-request/followRequestPagination.test.ts`: threshold, Native metric merge, success/error request guard behavior.
- Create `apps/app/src/stories/FollowRequests.stories.tsx`: actual Relay fragment/mutation catalog for state, accessibility, success/failure/retry, pagination and Profile switch.
- Modify `openspec/changes/add-incoming-follow-request-management/tasks.md`: verification evidence가 생긴 task 1.1–2.4만 `[x]`로 변경한다.

---

### Task 1: Protected route와 공통 상태 경계

**Files:**

- Test: `apps/app/src/components/follow-request/FollowRequestRoute.test.ts`
- Create: `apps/app/src/app/(tabs)/(protected)/follow-requests.tsx`
- Create: `apps/app/src/components/follow-request/FollowRequestList.tsx`

**Interfaces:**

- Produces: `FollowRequestList({ profile }: { profile: FollowRequestList_profile$key })`
- Produces: `FollowRequestListState({ state, onRetry? }: { state: 'error' | 'loading' | 'profileRequired'; onRetry?: () => void })`
- Route query: `FollowRequestsPageQuery` spreads `FollowRequestList_profile` from `currentSession.selectedProfile`.

- [ ] **Step 1: RED — route observable behavior test 작성**

  Mock `react-relay`, `useRelayActor`, React Native primitives and `FollowRequestList` at the module boundary. The assertions must prove these breaks are caught: wrong title/state, querying without the selected Profile, retry not changing `fetchKey`, and revision changes reusing old route-local state.

  ```ts
  await renderScreen({ revision: 4, selectedProfileId: 'profile-a' });
  assert.deepEqual(
    rendered('FollowRequestList').map((node) => node.props.identity),
    ['profile-a'],
  );
  assert.equal(queryHistory.at(-1)?.fetchKey, '4:0');

  queryMode = 'error';
  await renderScreen({ revision: 4, selectedProfileId: 'profile-a' });
  assert.equal(requireRendered('FollowRequestListState').props.state, 'error');
  queryMode = 'success';
  await act(async () => requireRendered('FollowRequestListState').props.onRetry());
  assert.equal(queryHistory.at(-1)?.fetchKey, '4:1');

  await renderScreen({ revision: 5, selectedProfileId: 'profile-b' });
  assert.deepEqual(
    rendered('FollowRequestList').map((node) => node.props.identity),
    ['profile-b'],
  );
  assert.equal(queryHistory.at(-1)?.fetchKey, '5:0');
  ```

- [ ] **Step 2: Verify RED**

  Run:

  ```bash
  pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/follow-request/FollowRequestRoute.test.ts
  ```

  Expected: FAIL because the `/follow-requests` route and list exports do not exist.

- [ ] **Step 3: GREEN — minimal route/state implementation**

  The route must follow the existing Notifications boundary without copying notification behavior:

  ```tsx
  const FollowRequestsQuery = graphql`
    query FollowRequestsPageQuery {
      currentSession {
        id
        selectedProfile {
          id
          ...FollowRequestList_profile
        }
      }
    }
  `;

  export default function FollowRequestsScreen() {
    const { revision } = useRelayActor();
    return <FollowRequestsRoute key={revision} revision={revision} />;
  }

  function FollowRequestsRoute({ revision }: { revision: number }) {
    const [fetchKey, setFetchKey] = useState(0);
    return (
      <RouteBoundary
        error={(retry) => <FollowRequestListState onRetry={retry} state="error" />}
        loading={<FollowRequestListState state="loading" />}
        onRetry={() => setFetchKey((value) => value + 1)}
        title="팔로워 요청을 불러오지 못했어요"
      >
        <FollowRequestsContent fetchKey={`${revision}:${fetchKey}`} />
      </RouteBoundary>
    );
  }
  ```

  `FollowRequestListState` must render `<PageHeader title="팔로워 요청" />` before its state content. The loading state hides skeletons from accessibility and exposes a polite live-region label; error exposes an alert and retry; profile-required explains that a selected Profile is required.

- [ ] **Step 4: Verify GREEN and refactor**

  Run the same targeted test. Expected: PASS. Keep route query ownership in the route and do not extract a query helper.

- [ ] **Step 5: Checkpoint commit**

  Stage only the OpenSpec artifacts, plan, route/list scaffold and route test; commit with `PROD-566 받은 요청 화면 경계를 추가한다` after `git diff --cached` review.

---

### Task 2: 요청 행, 서버 확인 mutation과 정확한 cache 제거

**Files:**

- Create: `apps/app/src/components/follow-request/FollowRequestListItem.tsx`
- Create: `apps/app/src/components/follow-request/followRequestStore.ts`
- Test: `apps/app/src/components/follow-request/followRequestStore.test.ts`
- Modify: `apps/app/src/components/follow-request/FollowRequestList.tsx`

**Interfaces:**

- Consumes: current connection ID computed with `ConnectionHandler.getConnectionID(profile.id, 'FollowRequestList_incomingProfileFollowRequests')`.
- Produces: `FollowRequestListItem({ connectionId, request })` consuming `FollowRequestListItem_request$key`.
- Produces: `removeFollowRequestFromConnection(store, connectionId, requestId): void` using `ConnectionHandler.deleteNode` and `store.delete`.

- [ ] **Step 1: RED — exact edge removal and actor isolation test 작성**

  Build two real Relay Runtime stores with the same Profile/request IDs but independent RecordSources. Seed each connection with `request-a` and `request-b`, run the updater only against actor A, and assert actor A retains only B while actor B retains both.

  ```ts
  actorA.commitUpdate((store) =>
    removeFollowRequestFromConnection(store, connectionId, 'request-a'),
  );

  assert.deepEqual(connectionNodeIds(actorA, connectionId), ['request-b']);
  assert.equal(actorA.getStore().getSource().get('request-a'), undefined);
  assert.deepEqual(connectionNodeIds(actorB, connectionId), ['request-a', 'request-b']);
  ```

- [ ] **Step 2: Verify RED**

  Run the targeted store test. Expected: FAIL because the store helper does not exist.

- [ ] **Step 3: GREEN — minimal store helper**

  ```ts
  export function removeFollowRequestFromConnection(
    store: RecordSourceSelectorProxy,
    connectionId: string,
    requestId: string,
  ) {
    const connection = store.get(connectionId);
    if (connection) ConnectionHandler.deleteNode(connection, requestId);
    store.delete(requestId);
  }
  ```

  Run the targeted test and keep the helper limited to the exact connection and ID.

- [ ] **Step 4: RED — actual row behavior in Storybook interaction 작성**

  Before the production row exists, add story assertions that catch requester filtering, nested action targets, time rendering, optimistic removal, global blocking and unavailable approval:

  ```ts
  expect(canvas.getByRole('link', { name: /별빛 여행자 프로필/ })).toHaveAttribute(
    'href',
    '/@starlight',
  );
  expect(canvas.getByRole('button', { name: '승인' })).toBeEnabled();
  expect(canvas.getByRole('button', { name: '거절' })).toBeEnabled();
  expect(canvas.queryByText(/2026-|분 전|시간 전/)).not.toBeInTheDocument();
  expect(canvas.getByText('확인할 수 없는 프로필')).toBeVisible();
  expect(canvas.queryByRole('button', { name: /확인할 수 없는.*승인/ })).not.toBeInTheDocument();
  ```

  Add separate mutation-loading, error/retry, approve-success and reject-success stories. During loading only the active row's two actions are disabled; on error the row remains with an alert and a same-action retry; on success only the payload ID row disappears. The approve-success story also primes both participant Profile records and verifies the server-returned `followersCount` and `followingCount` are normalized into the existing Relay cache.

- [ ] **Step 5: Verify RED**

  Run Relay compiler and the targeted story. Expected: FAIL because `FollowRequestListItem`/fragment/mutations are absent.

- [ ] **Step 6: GREEN — fragment, row and mutations**

  Use only observable fields; do not select `createdAt`:

  ```graphql
  fragment FollowRequestListItem_request on ProfileFollowRequest {
    id
    follower {
      id
      avatar {
        id
        url
      }
      displayName
      handle
      relativeHandle
    }
  }
  ```

  Approve and reject operations both select `profileFollowRequestId`; approve also selects `profileFollow { id follower { id } followee { id } }`, `followerProfile { id followingCount }`, and `followeeProfile { id followersCount }`; reject selects `followeeProfile { id }`. Do not supply an optimistic response/updater. In the final `updater`, read the payload ID and call `removeFollowRequestFromConnection` for the passed current connection ID. Participant counts use server values and ordinary Relay normalization rather than client-side arithmetic.

  Row local state is exactly:

  ```ts
  type FollowRequestAction = 'approve' | 'reject';
  const [pendingAction, setPendingAction] = useState<FollowRequestAction | null>(null);
  const [failedAction, setFailedAction] = useState<FollowRequestAction | null>(null);
  ```

  `onCompleted` clears local state after the Relay updater runs. `onError` keeps the row, clears pending, and records the failed action. Both action controls receive `disabled={pendingAction !== null}` and matching `accessibilityState`; the failed action label becomes `승인 다시 시도` or `거절 다시 시도`. Regular requester content is one `Link asChild` Profile target; action buttons are siblings, never nested in the link. The unavailable row has no Link and no approve control.

- [ ] **Step 7: Verify GREEN and refactor**

  Run Relay compiler, store test and targeted Storybook interactions. Confirm mutation failure does not call the final updater and two different rows can still be acted on independently.

- [ ] **Step 8: Checkpoint commit**

  Stage only row/store/list/story files and commit with `PROD-566 팔로우 요청 승인과 거절을 연결한다`.

---

### Task 3: 자동 cursor pagination과 하단 복구

**Files:**

- Create: `apps/app/src/components/follow-request/followRequestPagination.ts`
- Test: `apps/app/src/components/follow-request/followRequestPagination.test.ts`
- Modify: `apps/app/src/components/follow-request/FollowRequestList.tsx`
- Modify: `apps/app/src/stories/FollowRequests.stories.tsx`

**Interfaces:**

- Produces: `FollowRequestScrollMetrics = { contentLength: number; offset: number; viewportLength: number }`.
- Produces: `isFollowRequestListNearEnd(metrics): boolean`, true at one viewport or less from the end only when content and viewport are positive.
- Produces: `createFollowRequestNativeScrollHandlers(metricsRef, onMetrics)` and `resumeFollowRequestNativePagination(requestRef, metricsRef, onMetrics)`.

- [ ] **Step 1: RED — metric boundary and request guard tests 작성**

  ```ts
  assert.equal(
    isFollowRequestListNearEnd({ contentLength: 2400, offset: 800, viewportLength: 800 }),
    true,
  );
  assert.equal(
    isFollowRequestListNearEnd({ contentLength: 2401, offset: 800, viewportLength: 800 }),
    false,
  );
  assert.equal(
    isFollowRequestListNearEnd({ contentLength: 0, offset: 0, viewportLength: 800 }),
    false,
  );
  ```

  Feed `onLayout`, `onContentSizeChange`, and `onScroll` into the Native handler and assert literal merged metrics. Assert successful completion releases the in-flight guard and rechecks saved metrics; error keeps automatic loading stopped until explicit retry.

- [ ] **Step 2: Verify RED**

  Run the targeted pagination test. Expected: FAIL because the helper does not exist.

- [ ] **Step 3: GREEN — pure metric helper**

  Implement only the tested threshold/merge/resume behavior, matching existing platform event shapes without importing DOM types into Native code. Run the targeted test; expected PASS.

- [ ] **Step 4: RED — Relay pagination preservation stories**

  Provide a Profile fixture whose incoming connection has one existing edge and `hasNextPage: true`. Add stories for `paginationLoading`, `paginationError`, and successful next response. Assert existing requester remains visible during loading/error, the error exposes `팔로워 요청을 더 불러오지 못했어요` plus `다시 시도`, and retry adds the next literal requester without duplication.

- [ ] **Step 5: GREEN — Web/Native automatic loading**

  `FollowRequestList` uses `usePaginationFragment` with count 20 and connection key `FollowRequestList_incomingProfileFollowRequests`. `loadNextPage` exits when `!hasNext`, Relay reports loading, or `requestInFlightRef.current`; it clears the bottom error and calls `loadNext(20, { onComplete })`.

  Native passes the helper's handlers to `ScrollView`. Web registers passive document `scroll` and `resize` listeners plus one animation-frame initial check, and removes all three on cleanup. Successful pagination schedules guard release and rechecks metrics so a short page can continue loading; an error preserves current edges, exposes bottom retry and prevents automatic loops. Profile/actor remount initializes all refs and error state again.

- [ ] **Step 6: Verify GREEN and refactor**

  Run the targeted pagination test and stories. Mentally mutate `hasNext`, in-flight guard, error gate and threshold comparisons; at least one test/story must fail for each wrong branch.

- [ ] **Step 7: Checkpoint commit**

  Stage only pagination/list/story changes and commit with `PROD-566 받은 요청 자동 페이지네이션을 추가한다`.

---

### Task 4: Slice verification, OpenSpec progress and publication

**Files:**

- Modify: `openspec/changes/add-incoming-follow-request-management/tasks.md`
- Verify all files above; no navigation, API, DB or notification file may appear in the diff.

- [ ] **Step 1: Targeted RED/GREEN evidence review**

  Confirm each new production responsibility has a test that was observed failing before its implementation. Re-run targeted route, store, pagination and Storybook tests.

- [ ] **Step 2: Generated contract and static checks**

  Run:

  ```bash
  pnpm --filter @kosmo/app relay
  pnpm --filter @kosmo/app check
  pnpm --filter @kosmo/app test:unit
  pnpm --filter @kosmo/app build-storybook
  pnpm --filter @kosmo/app test:storybook
  pnpm lint:eslint
  pnpm lint:prettier
  pnpm exec openspec validate add-incoming-follow-request-management --strict
  git diff --check
  ```

  Passing automation does not count as Web keyboard/screen-reader or Android/iOS touch/busy-state runtime QA.

- [ ] **Step 3: OpenSpec progress update**

  Mark only 1.1–2.4 complete after their verification evidence exists. Leave 3.1–3.3 and 4.1–4.4 unchecked and do not archive the change.

- [ ] **Step 4: Independent implementation review**

  Request one read-only independent reviewer against the exact branch diff, OpenSpec tasks 1.1–2.4, live PROD-566/272 authority, and verification outputs. Fix only confirmed in-scope findings with a failing regression test first.

- [ ] **Step 5: Final local review and commit**

  Review `git status --short`, `git diff`, `git diff --cached` and scope. Commit any verification/task bookkeeping separately with an intent-revealing PROD-566 message.

- [ ] **Step 6: Push and Draft PR**

  Push `PROD-566`, draft a Korean PR body with changes, rationale, the already approved OpenSpec decisions, verification and explicit remaining PROD-654/runtime QA/OpenSpec archive gaps, show the exact PR draft to the user, and create the Draft PR only after that external-write confirmation.

---

## Self-Review

- Spec coverage: Task 1 covers protected route, common header and initial states; Task 2 covers regular/unavailable requester rows, server-confirmed approve/reject, exact removal, retry and actor Store isolation; Task 3 covers automatic opaque cursor pagination and bottom retry; Task 4 covers the owned verification and preserves split lifecycle.
- Exclusions: no task changes shell navigation, bottom tab, `/menu`, notifications, outgoing FollowButton, API/core/DB/migration, dependency or archive state.
- Type consistency: the route passes `FollowRequestList_profile$key`; the list passes `FollowRequestListItem_request$key` and one current `connectionId`; both mutations return `profileFollowRequestId`; the store helper accepts the same ID and current connection ID.
- Placeholder scan: no unresolved implementation placeholder or future behavior is used. Runtime platform QA is explicitly reported as an unrun verification boundary when unavailable, not marked complete.
