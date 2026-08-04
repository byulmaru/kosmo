# PROD-529 Hashtag 관련 Profile client navigation 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: 구현 세션에서 `superpowers:executing-plans`와 `superpowers:test-driven-development`를 사용해 각 task의 RED → GREEN → REFACTOR를 순서대로 수행한다. 이 계획은 PROD-529 client slice만 구현하며 PROD-525 통합 검증·archive를 포함하지 않는다.

**Goal:** 로그인한 Account가 공개 Profile의 TagChip 또는 보호된 `/hashtags/[hashtagId]/profiles` 직접 진입에서 exact Hashtag identity의 관련 공개 Profile을 20개씩 탐색하고 기존 Profile route로 이동할 수 있게 한다.

**Architecture:** Expo Router route가 path의 Hashtag global ID, actor revision과 첫 query boundary를 소유하고 `node(id:)`로 canonical Hashtag 이름을 조회한다. Hashtag-colocated Relay pagination fragment는 `relatedProfiles` 전용 connection과 이미 표시한 edge를 보존하는 명시적 load-more 상태를 소유한다. 공개 `ProfileHero`만 표시 전용 `ProfileTagChip` 주위의 Link/Pressable navigation target을 소유하며 기존 `ProfileListItem`이 Profile 이동과 follow action을 그대로 제공한다.

**Tech Stack:** Expo Router, React Native / React Native Web, React Relay 21, Node test runner, React Test Renderer, Storybook 10 + Vitest Browser, Playwright, PostgreSQL E2E fixtures, OpenSpec.

## Global Constraints

- 구현 대상은 OpenSpec task 2.1–2.5와 Linear PROD-529뿐이다. 완료된 PROD-528 API·schema·ordering을 변경하지 않고 PROD-525 통합 검증·archive는 남긴다.
- canonical route는 `/hashtags/[hashtagId]/profiles`이며 path에는 Hashtag global ID만 전달한다. Hashtag `name`과 `#` text는 화면 제목·접근성 copy에만 사용하고 identity나 검색 입력으로 사용하지 않는다.
- route는 Account 로그인을 전제로 하되 selected Profile을 요구하지 않는다. actor revision 또는 Hashtag ID가 바뀌면 첫 query retry state를 remount한다.
- 첫 응답 전 PageHeader는 `관련 프로필`, Hashtag 응답 뒤에는 `#<태그명> 관련 프로필`이다. 첫 loading/error/retry, 존재하지 않거나 Hashtag가 아닌 Node, empty, next-page loading/error/retry와 terminal을 명시적으로 표시한다.
- `HashtagRelatedProfileList_relatedProfiles` connection key는 search/followers/following과 공유하지 않는다. page size는 20이고 `isLoadingNext` 동안 추가 요청을 막으며 다음 page 오류에서 기존 edge를 유지한다.
- `ProfileTagChip.tsx`는 표시·편집 action 계약을 그대로 유지한다. 공개 `ProfileHero`의 navigation wrapper만 exact ID href, link role, `#<태그명> 관련 프로필 보기` 이름과 Web 32 CSS px·iOS 44 pt·Android 48 dp target을 소유한다.
- 관련 Profile 행은 기존 `ProfileListItem linked`를 그대로 사용해 Profile route와 follow action을 재사용한다. 공용 Profile connection component를 범용화하거나 복제하지 않는다.
- API·DB schema/migration·dependency·Remote lookup/materialization·analytics·사람 검색 동작을 변경하지 않는다.
- E2E test-only 변경은 `db-fixtures.ts`의 Hashtag와 ProfileHashtags 관계 생성 helper 1개로 제한한다. 실제 TagChip→복수 관련 Profile 흐름을 UI/API setup에 결합하지 않고 seed하기 위해 필요하며 새 generic harness나 production fixture를 만들지 않는다.
- Web 자동화와 React Native source mapping은 iOS·Android 실제 runtime 완료 증거가 아니다. Native focus/touch/screen reader runtime QA는 handoff의 남은 gate로 기록한다.
- generated Relay artifact는 `pnpm --filter @kosmo/app relay`로 생성·검사하되 repository 관례에 따라 commit하지 않는다.
- `.superpowers/**`와 `docs/superpowers/**`는 만들거나 commit하지 않는다.

---

## File Map

- Create `apps/app/src/app/(tabs)/(protected)/hashtags/[hashtagId]/profiles.tsx`: Hashtag ID normalization, actor revision key, Node query와 첫 loading/error/not-found boundary.
- Create `apps/app/src/components/profile/HashtagRelatedProfileList.tsx`: Hashtag pagination fragment, canonical header, empty/content/next-page/terminal states.
- Create `apps/app/src/components/profile/HashtagRelatedProfilesRoute.test.ts`: exact ID query, title/state handoff, retry fetchKey와 route identity remount 검증.
- Modify `apps/app/src/components/profile/ProfileHero.tsx`: 공개 TagChip의 Link/Pressable wrapper와 platform target mapping.
- Modify `apps/app/src/components/profile/ProfileHero.test.ts`: exact href/params, role/name/target과 기존 표시 순서 검증.
- Modify `apps/app/src/stories/Profiles.stories.tsx`: 기존 공개 TagChip catalog가 새 link contract와 32px Web target을 검증하게 갱신.
- Create `apps/app/src/stories/HashtagRelatedProfiles.stories.tsx`: 실제 Relay fragment의 loading/error/empty/content/pagination failure-retry/terminal catalog.
- Modify `apps/web/e2e/db-fixtures.ts`: 테스트 DB에 Hashtag와 복수 ProfileHashtags 관계를 생성하는 최소 helper.
- Modify `apps/web/e2e/profile-edit.e2e.ts`: PROD-527의 공개 TagChip 비상호작용 기대를 새 exact link contract로 갱신.
- Create `apps/web/e2e/profile-tag-navigation.e2e.ts`: Tab/role/name/Enter, canonical route/title/list와 기존 Profile route 이동 검증.
- Modify `openspec/changes/add-hashtag-related-profiles/tasks.md`: 실제 evidence가 생긴 2.1–2.5만 완료 처리하고 Web/Native 증거 경계를 기록.

---

### Task 1: Protected route와 exact Hashtag Node boundary

**Files:**

- Test: `apps/app/src/components/profile/HashtagRelatedProfilesRoute.test.ts`
- Create: `apps/app/src/app/(tabs)/(protected)/hashtags/[hashtagId]/profiles.tsx`
- Create: `apps/app/src/components/profile/HashtagRelatedProfileList.tsx`

**Interfaces:**

- Consumes: `useLocalSearchParams<{ hashtagId?: string | string[] }>()`, `useRelayActor().revision`, `node(id: $id)`.
- Produces: `HashtagRelatedProfileList({ hashtag }: { hashtag: HashtagRelatedProfileList_hashtag$key })`.
- Produces: `HashtagRelatedProfileListState({ name?, onRetry?, state }: { name?: string; onRetry?: () => void; state: 'error' | 'loading' | 'notFound' })`.
- Route query: `HashtagRelatedProfilesPageQuery($id: ID!)` selects `__typename`, Hashtag `id`, `name` and `...HashtagRelatedProfileList_hashtag`.

- [x] **Step 1: RED — route observable behavior test를 먼저 작성한다**

  `react-relay`, `expo-router`, `useRelayActor`, `HashtagRelatedProfileList`와 state component를 module boundary에서 mock한다. 다음 계약을 각각 깨뜨리면 실패해야 한다.

  ```ts
  hashtagId = 'hashtag-global-a';
  revision = 4;
  await renderScreen();

  assert.deepEqual(queryHistory.at(-1), {
    fetchKey: '4:0',
    variables: { id: 'hashtag-global-a' },
  });
  assert.deepEqual(requireRendered('HashtagRelatedProfileList').props, {
    identity: 'hashtag-global-a',
    name: 'Fediverse',
  });
  ```

  별도 cases로 첫 loading은 `state="loading"`과 generic title, query error 뒤 retry는 `fetchKey`를 `4:1`로 변경, `node: null`과 `__typename !== 'Hashtag'`는 `notFound`, missing/array param은 query 없이 `notFound`임을 확인한다. `revision` 또는 `hashtagId` 변경은 retry counter를 0으로 초기화하고 새 ID만 query한다.

- [x] **Step 2: Verify RED**

  Run:

  ```bash
  pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/profile/HashtagRelatedProfilesRoute.test.ts
  ```

  Expected: FAIL because route와 list exports가 아직 없다.

- [x] **Step 3: GREEN — 최소 route/query/state 경계를 구현한다**

  route param normalizer는 해당 route 안의 private function으로 유지한다. 빈 문자열과 배열을 거부하고 name normalization이나 decoding을 추가하지 않는다.

  ```tsx
  const HashtagRelatedProfilesQuery = graphql`
    query HashtagRelatedProfilesPageQuery($id: ID!) {
      node(id: $id) {
        __typename
        ... on Hashtag {
          id
          name
          ...HashtagRelatedProfileList_hashtag
        }
      }
    }
  `;

  export default function HashtagRelatedProfilesScreen() {
    const { hashtagId: rawHashtagId } = useLocalSearchParams<{
      hashtagId?: string | string[];
    }>();
    const hashtagId = typeof rawHashtagId === 'string' && rawHashtagId ? rawHashtagId : null;
    const { revision } = useRelayActor();

    return hashtagId ? (
      <HashtagRelatedProfilesRoute
        hashtagId={hashtagId}
        key={`${revision}:${hashtagId}`}
        revision={revision}
      />
    ) : (
      <HashtagRelatedProfileListState state="notFound" />
    );
  }
  ```

  `HashtagRelatedProfilesRoute`는 route-local `fetchKey`를 소유하고 `RouteBoundary`의 loading/error를 `HashtagRelatedProfileListState`로 렌더한다. query options는 `{ fetchKey: `${revision}:${fetchKey}`, fetchPolicy: 'store-and-network' }`다. content는 `node?.__typename === 'Hashtag'`일 때만 list에 fragment ref를 넘기고 나머지는 `notFound`를 렌더한다.

  state component는 항상 `<PageHeader title={name ? `#${name} 관련 프로필` : '관련 프로필'} />`를 먼저 렌더한다. loading은 `StateView loading title="관련 프로필을 불러오는 중입니다."`, error는 alert와 `다시 시도`, not-found는 `해시태그를 찾을 수 없어요`와 존재하지 않거나 삭제됐다는 설명을 제공한다.

- [x] **Step 4: Verify GREEN and refactor**

  Run the same targeted test. Expected: PASS. query ownership과 param normalization을 route 밖의 generic helper로 추출하지 않는다.

- [x] **Step 5: Checkpoint preparation**

  OpenSpec artifacts, 이 계획, route/list state scaffold와 route test만 첫 checkpoint 후보로 유지한다. commit 단계에서는 `$kosmo-codex-workflows:commit-safely`를 사용하고 staged diff를 사용자에게 보여준다.

---

### Task 2: Hashtag 전용 Relay connection과 복구 가능한 pagination

**Files:**

- Modify: `apps/app/src/components/profile/HashtagRelatedProfileList.tsx`
- Create: `apps/app/src/stories/HashtagRelatedProfiles.stories.tsx`

**Interfaces:**

- Fragment: `HashtagRelatedProfileList_hashtag` with `@argumentDefinitions(count: Int = 20, cursor: String)` and `@refetchable(queryName: "HashtagRelatedProfilesNextPageQuery")`.
- Connection: `relatedProfiles(first: $count, after: $cursor) @connection(key: "HashtagRelatedProfileList_relatedProfiles")`.
- Row: each `edge.node` is passed to `<ProfileListItem linked profile={...} />`; edge cursor is the render key.
- Pagination: `loadNext(20, { onComplete })`; `hasNext`, `isLoadingNext` and local `loadError` determine the affordance.

- [x] **Step 1: RED — actual Relay state catalog와 interactions를 작성한다**

  새 story file은 production component와 실제 fragment를 렌더한다. 최소 stories와 assertions는 다음과 같다.
  - `Loading`: generic `관련 프로필` header와 loading status.
  - `InitialErrorRetry`: generic header, alert와 `다시 시도`; action 호출이 route retry callback에 전달됨.
  - `NotFound`: generic header와 not-found copy.
  - `Empty`: `#Fediverse 관련 프로필` header, empty copy, 행·pagination button 없음.
  - `ContentAndNextPage`: initial Profile rows가 link와 기존 `팔로우` action을 제공하고 `더 불러오기`가 보임.
  - `NextPageErrorRetry`: 첫 load response는 error, 기존 행은 계속 표시, alert와 `다시 시도`; retry response는 새 edge를 한 번만 append.
  - `NextPageLoadingGuard`: pagination pending 동안 button이 busy/disabled이고 연속 activation이 요청을 중복 실행하지 않음.
  - `Terminal`: `hasNextPage=false`이면 load-more affordance 없음.

  next-page failure/retry는 repository Storybook Relay parameter를 그대로 사용한다.

  ```ts
  parameters: {
    relay: {
      paginationResponses: [
        { error: '관련 Profile 다음 page 실패' },
        { data: relatedProfilesNextPage },
      ],
    },
  }
  ```

- [x] **Step 2: Verify RED**

  Run:

  ```bash
  pnpm --filter @kosmo/app relay
  pnpm --filter @kosmo/app test:storybook -- src/stories/HashtagRelatedProfiles.stories.tsx
  ```

  Expected: Relay compiler 또는 story가 pagination fragment/list behavior 부재로 FAIL한다.

- [x] **Step 3: GREEN — 전용 fragment와 observable list states를 구현한다**

  ```graphql
  fragment HashtagRelatedProfileList_hashtag on Hashtag
  @argumentDefinitions(count: { type: "Int", defaultValue: 20 }, cursor: { type: "String" })
  @refetchable(queryName: "HashtagRelatedProfilesNextPageQuery") {
    id
    name
    relatedProfiles(first: $count, after: $cursor)
      @connection(key: "HashtagRelatedProfileList_relatedProfiles") {
      edges {
        cursor
        node {
          id
          ...ProfileListItem_profile
        }
      }
    }
  }
  ```

  `HashtagRelatedProfileList`는 `usePaginationFragment` 결과에서 rows를 만들고 canonical PageHeader를 먼저 렌더한다. `profiles.length === 0`이면 empty state를 표시한다. load-more handler는 다음 guard와 completion만 소유한다.

  ```ts
  const loadMore = () => {
    if (!pagination.hasNext || pagination.isLoadingNext) return;
    setLoadError(false);
    pagination.loadNext(20, {
      onComplete: (error) => setLoadError(Boolean(error)),
    });
  };
  ```

  `loadError`는 fragment data를 대체하지 않는다. pagination footer는 `pagination.hasNext || loadError`일 때만 보이고 오류 alert, `더 불러오기`/`불러오는 중`/`다시 시도`, live region을 제공한다. error retry도 같은 cursor에서 `loadNext(20)`만 다시 호출한다.

- [x] **Step 4: Verify GREEN and refactor**

  Run Relay compiler와 targeted Storybook test. Expected: PASS. followers/following component의 private types·copy를 export하거나 search connection을 공유하지 않는다.

- [x] **Step 5: Checkpoint commit and push**

  Task 1–2 GREEN 뒤 `$kosmo-codex-workflows:commit-safely`로 승인된 파일만 stage하고 `PROD-529 관련 프로필 route와 목록 경계를 추가한다`로 commit한다. commit 성공 직후 현재 branch를 push한다. 첫 push 뒤 Draft PR의 정확한 제목·본문·target을 사용자에게 보여주고 별도 승인을 받은 뒤에만 생성한다.

---

### Task 3: 공개 Profile TagChip navigation과 platform target

**Files:**

- Modify: `apps/app/src/components/profile/ProfileHero.test.ts`
- Modify: `apps/app/src/components/profile/ProfileHero.tsx`
- Modify: `apps/app/src/stories/Profiles.stories.tsx`
- Keep unchanged: `apps/app/src/components/profile/ProfileTagChip.tsx`

**Interfaces:**

- Consumes: existing fragment `tags { id name }` and display-only `ProfileTagChip`.
- Produces: Expo Router href `{ pathname: '/hashtags/[hashtagId]/profiles', params: { hashtagId: tag.id } }`.
- Produces: one `Pressable` per public tag with role `link`, label `#${tag.name} 관련 프로필 보기`, and target size `Platform.select({ android: 48, ios: 44, web: 32, default: 48 })`.

- [x] **Step 1: RED — 기존 public tag unit/catalog 기대를 새 contract로 바꾼다**

  `ProfileHero.test.ts`의 “비대화형 chip” assertion을 다음 observable contract로 교체한다. `expo-router` mock은 object href를 보존하고 `react-native` mock은 `Platform.select`을 Web 32로 반환한다.

  ```ts
  const links = tagList.findAll((node) => (node.type as unknown) === 'Link');
  const targets = tagList.findAll((node) => (node.type as unknown) === 'Pressable');
  assert.deepEqual(
    links.map((node) => node.props.href),
    [
      {
        pathname: '/hashtags/[hashtagId]/profiles',
        params: { hashtagId: 'hashtag-fediverse' },
      },
      {
        pathname: '/hashtags/[hashtagId]/profiles',
        params: { hashtagId: 'hashtag-development' },
      },
    ],
  );
  assert.equal(targets[0]!.props.accessibilityRole, 'link');
  assert.equal(targets[0]!.props.accessibilityLabel, '#Fediverse 관련 프로필 보기');
  assert.equal(targets[0]!.props.style.minHeight, 32);
  ```

  기존 bio→tags→counts 순서와 visual chip 높이 32는 유지한다. `Profiles.stories.tsx`도 actual Web DOM에서 exact link href, accessible name과 target bounds 32px를 확인하도록 갱신한다.

- [x] **Step 2: Verify RED**

  Run:

  ```bash
  pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/profile/ProfileHero.test.ts
  pnpm --filter @kosmo/app test:storybook -- src/stories/Profiles.stories.tsx
  ```

  Expected: public TagChip이 아직 Link/Pressable을 렌더하지 않아 FAIL한다.

- [x] **Step 3: GREEN — ProfileHero 내부 navigation wrapper만 추가한다**

  `ProfileHero.tsx` 안의 private `ProfileTagLink`가 target size와 href를 계산하고 표시 chip을 감싼다. 새 공용 component나 `ProfileTagChip` prop을 만들지 않는다.

  ```tsx
  function ProfileTagLink({ id, name }: { id: string; name: string }) {
    const targetSize = Platform.select({ android: 48, ios: 44, web: 32, default: 48 });
    const href = {
      pathname: '/hashtags/[hashtagId]/profiles',
      params: { hashtagId: id },
    } as const;

    return (
      <Link asChild href={href}>
        <Pressable
          accessibilityLabel={`#${name} 관련 프로필 보기`}
          accessibilityRole="link"
          style={StyleSheet.flatten([
            styles.tagTarget,
            { minHeight: targetSize, minWidth: targetSize },
          ])}
        >
          <ProfileTagChip name={name} removable={false} />
        </Pressable>
      </Link>
    );
  }
  ```

  `styles.tagTarget`은 visual chip을 중앙 정렬하고 `maxWidth: '100%'`만 소유한다. `StyleSheet.flatten`으로 Web `Link asChild`에 indexed style 배열이 전달되지 않게 하면서 iOS/Android target의 추가 높이와 너비는 wrapper에만 적용하고 chip visual은 32를 유지한다. 태그 map key는 계속 exact `tag.id`다.

- [x] **Step 4: Verify GREEN and regression boundary**

  Targeted unit/Storybook tests를 재실행한다. 기존 Profile edit story를 실행해 편집 제거 action, disabled state와 validation surface가 변하지 않았음을 확인한다.

  ```bash
  pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/profile/ProfileHero.test.ts
  pnpm --filter @kosmo/app test:storybook -- src/stories/Profiles.stories.tsx src/stories/ProfileEdit.stories.tsx
  ```

- [x] **Step 5: Checkpoint commit and push**

  승인된 ProfileHero tests/catalog/implementation만 stage하고 `PROD-529 프로필 태그 탐색을 연결한다`로 commit한 뒤 즉시 push한다. `ProfileTagChip.tsx`에 diff가 생기면 checkpoint를 멈추고 범위 이탈을 검토한다.

---

### Task 4: 실제 Web 흐름, 검색 회귀와 completion evidence

**Files:**

- Modify: `apps/web/e2e/db-fixtures.ts`
- Modify: `apps/web/e2e/profile-edit.e2e.ts`
- Create: `apps/web/e2e/profile-tag-navigation.e2e.ts`
- Modify: `openspec/changes/add-hashtag-related-profiles/tasks.md`

**Interfaces:**

- Produces test-only `createE2EHashtagRelation({ displayName, name, profileIds })` returning the inserted Hashtag row.
- E2E begins at an authenticated public Profile route, activates `#<태그명> 관련 프로필 보기`, verifies related list, then follows an existing Profile link.
- Search regression reuses the existing search E2E; no search fixture/helper or production code changes.

- [x] **Step 1: RED — 기존 공개 TagChip E2E 기대를 새 link contract로 갱신한다**

  `profile-edit.e2e.ts`의 마지막 two assertions를 exact link role/name과 canonical href로 바꾼다. 편집 저장 payload·공개 재조회·wrap 순서 assertions는 유지한다.

  ```ts
  const tagLink = page.getByRole('link', {
    name: '#FirstWrite 관련 프로필 보기',
    exact: true,
  });
  await expect(tagLink).toHaveAttribute('href', /\/hashtags\/[^/]+\/profiles$/);
  await expect(page.getByRole('button', { name: '#FirstWrite 제거' })).toHaveCount(0);
  ```

  새 `profile-tag-navigation.e2e.ts`에는 하나의 종단간 test를 먼저 작성한다. 로그인 Session의 entry Profile과 두 related Profiles를 만들고 같은 Hashtag relation에 연결한다. 공개 Profile route에서 실제 Tab key를 최대 20회 누르며 target이 focus될 때까지 탐색하고 focus되지 않으면 실패한다.

  ```ts
  const tagLink = page.getByRole('link', {
    name: '#Fediverse 관련 프로필 보기',
    exact: true,
  });
  for (
    let index = 0;
    index < 20 && !(await tagLink.evaluate((node) => node === document.activeElement));
    index += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(tagLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/hashtags\/[^/]+\/profiles$/);
  await expect(page.getByRole('heading', { name: '#Fediverse 관련 프로필' })).toBeVisible();
  ```

  이후 두 related Profile 이름/links와 기존 follow action을 확인하고 한 Profile link를 클릭해 `/<relativeHandle>` route와 Profile heading을 확인한다. 목록에는 관계 없는 Profile이 없음을 함께 검증한다.

- [x] **Step 2: Verify RED**

  Run:

  ```bash
  node scripts/test-db.mjs run -- pnpm test:e2e:database -- profile-edit.e2e.ts profile-tag-navigation.e2e.ts
  ```

  Expected: 기존 public chip에 link가 없고 새 route/list가 아직 완성되지 않은 시점에는 FAIL한다.

- [x] **Step 3: 최소 Hashtag relation fixture와 GREEN flow를 완성한다**

  `db-fixtures.ts`의 기존 `@kosmo/core/db` import에 `Hashtags`, `ProfileHashtags`만 추가하고 다음 helper를 추가한다.

  ```ts
  export async function createE2EHashtagRelation({
    displayName,
    name,
    profileIds,
  }: {
    displayName: string;
    name: string;
    profileIds: readonly string[];
  }) {
    const hashtag = await db
      .insert(Hashtags)
      .values({ displayName, name })
      .returning()
      .then(firstOrThrow);

    await db
      .insert(ProfileHashtags)
      .values(profileIds.map((profileId) => ({ hashtagId: hashtag.id, profileId })));
    return hashtag;
  }
  ```

  helper는 API/schema를 우회해 production behavior를 fake하지 않고, 이미 PROD-528에서 검증한 저장 관계를 test DB에 준비하는 역할만 한다. global Hashtag ID는 공개 Profile query가 반환한 Link href에서 관찰하며 test가 server-side ID encoding을 복제하지 않는다.

- [x] **Step 4: Targeted Web GREEN과 검색 회귀를 확인한다**

  Run:

  ```bash
  node scripts/test-db.mjs run -- pnpm test:e2e:database -- profile-edit.e2e.ts profile-tag-navigation.e2e.ts search.e2e.ts
  ```

  Expected: TagChip keyboard flow와 기존 사람 검색 input/result/pagination이 모두 PASS한다. Web target은 DOM bounds/keyboard로 검증하지만 Native runtime 완료로 기록하지 않는다.

- [x] **Step 5: App와 OpenSpec 전체 검증을 실행한다**

  Run:

  ```bash
  pnpm --filter @kosmo/app relay
  pnpm --filter @kosmo/app check
  pnpm --filter @kosmo/app test:unit
  pnpm --filter @kosmo/app test:storybook
  ./node_modules/.bin/openspec validate add-hashtag-related-profiles --strict
  pnpm lint:eslint
  pnpm lint:prettier
  git diff --check
  ```

  Expected: 모든 명령이 exit 0이다. Watchman이 Relay compiler를 막으면 `pnpm --filter @kosmo/app exec relay-compiler --noWatchman`과 `pnpm --filter @kosmo/app exec tsc --noEmit`을 분리 실행하고 환경 제한과 결과를 handoff에 정확히 기록한다.

- [x] **Step 6: OpenSpec evidence와 남은 gate를 기록한다**

  실제 결과가 있을 때만 task 2.1–2.5를 `[x]`로 변경한다. 날짜가 있는 verification note에 명령별 결과, Web proof, React Native source mapping, 미수행 iOS·Android runtime QA를 분리한다. task 3.1–3.2는 PROD-525 소유로 `[ ]`를 유지하며 이 change를 archive하지 않는다.

- [x] **Step 7: 독립 review와 최종 checkpoint**

  PROD-529 diff만 implementation review에 제출해 scope, exact ID, Relay connection isolation, state preservation, accessibility target, test gap을 재검토한다. 발견 사항을 수정하고 관련 검증을 다시 실행한 뒤 `$kosmo-codex-workflows:commit-safely`로 `PROD-529 관련 프로필 탐색 흐름을 검증한다` commit을 만들고 즉시 push한다.

---

## Git / PR Checkpoints

1. 구현 승인 뒤 detached HEAD에서 Linear의 branch name `prod-529`를 생성·switch한다. 기존 branch 존재 여부와 base가 최신인지 read-only 확인한 뒤 진행한다.
2. Task 1–2 GREEN: `PROD-529 관련 프로필 route와 목록 경계를 추가한다` → push.
3. Task 3 GREEN: `PROD-529 프로필 태그 탐색을 연결한다` → push.
4. Task 4 verification/evidence: `PROD-529 관련 프로필 탐색 흐름을 검증한다` → push.
5. 각 commit 전에 staged 파일·diff·검증 결과와 `.superpowers/**`, `docs/superpowers/**` 비포함을 확인한다. unrelated user changes는 stage하지 않는다.
6. 첫 push 뒤 Draft PR의 exact title/body/base/head를 사용자에게 미리 보여주고 승인받은 뒤 생성한다. review comment, Ready 전환, merge, Linear 상태 변경도 각각 exact external write를 먼저 확인받는다.
7. PROD-529 PR 자체 scope와 검증이 완료되면 Ready 여부를 별도로 판단하되 shared OpenSpec archive는 하지 않는다. PROD-525가 cross-slice 통합 검증과 archive를 소유한다.

## Completion Handoff

- 변경된 behavior와 exact route/identity를 요약한다.
- 실제 실행한 test commands와 pass/fail, Watchman 등 환경 제한을 구분한다.
- Web keyboard/a11y proof, RN platform target source mapping, 미검증 Native runtime QA를 별도 항목으로 보고한다.
- test-only DB helper 추가 이유와 production DB/schema 무변경을 명시한다.
- generated Relay artifacts 포함 여부, OpenSpec task 2.x 상태와 task 3.x 미완료를 보고한다.
- Draft/Ready/Linear/archive의 현재 상태와 다음 owner(PROD-525)를 명시한다.
