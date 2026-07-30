# PROD-492 Profile Edit Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. KOSMO schema, authorization, concurrency, GraphQL contract와 production route는 parent Sol이 소유하고 전체 구현 결과는 `implementation_reviewer`가 독립 검토한다.

**Goal:** selected Active/Normal Local Profile Owner가 displayName, bio, follow policy와 avatar/header를 안전하게 저장하고, 공개 Profile에서 변경된 이미지를 볼 수 있는 production 편집 흐름을 제공한다.

**Architecture:** 최신 `origin/main`의 PROD-581 Media `url`·`mediaType` persistence 위에 additive `profile_media` 관계를 추가한다. Core service가 selected Owner 권한, Local Ready Media와 text를 한 transaction에서 검증·저장하고, GraphQL은 guest-safe edit capability와 Profile 관계 기반 `Media.id + url` projection을 제공한다. Expo route wrapper가 기존 controlled presentation에 Relay, field별 upload, retry, dirty navigation을 연결한다.

**Tech Stack:** PostgreSQL, Drizzle ORM, TypeScript, Pothos GraphQL, React Relay, Expo Router 56, React Native Web/Android/iOS, Node test runner, Storybook.

## Global Constraints

- 실행 base는 PR #428 squash `4976dd2e46debfb2f21ce315ce84222ced39cd50`을 포함한 최신 `origin/main`이다.
- 구현 시작 시 `codex/prod-492` branch를 최신 `origin/main`에서 만들고, 삭제된 `PROD-581` 원격 branch를 base로 사용하지 않는다.
- `profile_media`는 UUIDv7 id, Profile/Media FK, `AVATAR | HEADER` kind, `created_at`, unique(Profile, kind), Media index를 가진다. 기존 Profile backfill과 `media_id` 전체 unique는 추가하지 않는다.
- avatar/header input은 omitted=유지, concrete Media global ID=교체, `null`=해당 kind 관계 제거다.
- selected Profile, Instance, Owner Membership과 Account eligibility를 commit 시 재검사한다. 요청된 모든 Media가 같은 selected Profile의 Local Ready Media이고 저장 URL이 있는지 먼저 확인한 뒤 write한다.
- 변경된 displayName은 Unicode code point 기준 1–40이며, 저장 원문과 정확히 같은 legacy 값은 허용한다. bio는 trim 후 JavaScript UTF-16 길이 500 이하다.
- `selectedProfileForEdit`은 guest/session 부재/부적격 Account에 오류 없이 `null`을 반환한다. public role과 `canEdit` scalar는 추가하지 않는다.
- Profile 공개 projection은 `Media.id + url`만 추가한다. `mediaType` GraphQL field와 standalone Media Node 공개 권한은 추가하지 않는다.
- Profile Tag presentation은 유지하지만 production route에서 렌더링하거나 mutation input으로 보내지 않는다.
- Media upload infrastructure, orphan cleanup, crop, thumbnail/variant, Remote Media, Fedify/ActivityPub, Settings 이동은 제외한다.
- Relay generated `__generated__` 파일은 생성해 검증하되 commit하지 않는다.
- `.superpowers/**`와 `docs/superpowers/**`는 stage·commit·PR에 절대 포함하지 않는다.
- 각 checkpoint는 한국어 commit을 만들고 즉시 push한다. 첫 문서 checkpoint push 뒤 base `main`의 Draft PR을 연다.
- 테스트 코드 범위: `profile_media` DB/core service, Profile GraphQL query/mutation integration, Profile route·Relay·upload·navigation을 직접 검증하는 기존 API/App test surface.
- 테스트 필요성: 권한 경쟁, tri-state 관계 원자성, 공개 Profile read, 부분 upload 실패와 navigation race가 부분 저장·정보 비공개 회귀·중복 upload를 만들지 않음을 관찰 가능한 결과로 증명한다.
- 테스트 제외 범위: Media upload 인프라 자체, orphan cleanup, Profile Tag·Settings, crop·thumbnail·variant·Remote Media·Fedify, 관련 없는 coverage·snapshot·새 범용 test harness 확대.

---

### Task 1: 최신 main branch와 계약 문서 checkpoint

**Files:**

- Modify: `docs/design/profile-edit.md`
- Modify: `openspec/changes/add-local-profile-edit/proposal.md`
- Modify: `openspec/changes/add-local-profile-edit/design.md`
- Modify: `openspec/changes/add-local-profile-edit/decisions.md`
- Modify: `openspec/changes/add-local-profile-edit/tasks.md`
- Modify: `openspec/changes/add-local-profile-edit/specs/profile-edit-ui/spec.md`
- Modify: `openspec/changes/add-local-profile-edit/specs/profile/spec.md`
- Create: `docs/plans/2026-07-30-prod-492-profile-edit-integration.md`

**Interfaces:**

- Consumes: PROD-492/PROD-581 Linear scope, canonical Profile/Media docs, approved OpenSpec decisions.
- Produces: implementation authority and a branch/PR base that every later task uses.

- [ ] **Step 1: Re-read Git and commit policy before mutation**

Read `memory/commit-pr.md`, its routed sub-documents, and `kosmo-codex-workflows:commit-safely`. Confirm the worktree contains only the eight approved documentation/plan files.

- [ ] **Step 2: Refresh and verify the parent commit**

Run:

```bash
git fetch origin main
git merge-base --is-ancestor 4976dd2e46debfb2f21ce315ce84222ced39cd50 origin/main
git status --short --branch
```

Expected: the ancestor command exits 0; only approved docs/plan paths are modified or untracked.

- [ ] **Step 3: Create the feature branch without discarding the approved diff**

Run:

```bash
git switch -c codex/prod-492 origin/main
git status --short --branch
```

Expected: branch is `codex/prod-492`; approved working-tree files remain changed; no source file is modified.

- [ ] **Step 4: Re-run document gates**

Run:

```bash
pnpm exec prettier --check docs/design/profile-edit.md docs/plans/2026-07-30-prod-492-profile-edit-integration.md openspec/changes/add-local-profile-edit
git diff --check
pnpm exec openspec validate add-local-profile-edit --strict
```

Expected: all three commands pass.

- [ ] **Step 5: Commit and push the contract checkpoint**

Stage only the eight paths listed above. Confirm both exclusion paths are absent, then commit and push:

```bash
git diff --cached --name-only -- .superpowers docs/superpowers
git commit -m "PROD-492 프로필 편집 계약을 정밀화한다"
git push -u origin codex/prod-492
```

Expected: exclusion check prints nothing; push succeeds.

- [ ] **Step 6: Open the early Draft PR**

Create a Draft PR against `main` with title `PROD-492 프로필 편집을 API와 Media에 연결한다`. The body must state:

```markdown
## 현재까지 완료

- Profile edit 데이터·권한·공개 조회·upload·navigation 계약 정밀화
- PROD-581 병합 결과를 구현 dependency로 확정

## 아직 구현하지 않음

- profile_media migration과 Core/API 구현
- production route, Relay, picker/upload, ProfileHero 표시
- Web/iOS/Android runtime QA

## 검증

- OpenSpec strict validation
- 문서 Prettier 및 diff check

## 남은 위험

- 구현 전이므로 권한 경쟁, DB 원자성, Relay와 플랫폼 navigation은 미검증
```

Read the Draft PR back and confirm base/head/title/body.

---

### Task 2: additive Profile Media schema와 migration

**Files:**

- Modify: `packages/core/enums.ts`
- Modify: `packages/core/db/enums.ts`
- Modify: `packages/core/db/tables.ts`
- Generated: `drizzle` 아래에서 `drizzle:generate --name prod_492_profile_media`가 출력하는 단일 migration directory
- Test: `packages/core/services/profile-update.test.ts`

**Interfaces:**

- Consumes: existing `Profiles`, `Media`, UUIDv7 helper and Drizzle enum convention.
- Produces: `ProfileMediaKind`, `ProfileMedia` table and FK/unique/index constraints consumed by Core/API.

- [ ] **Step 1: Add a failing schema contract test**

In `profile-update.test.ts`, import `ProfileMedia` and `ProfileMediaKind` and add a test that:

```ts
await db.insert(ProfileMedia).values([
  { kind: ProfileMediaKind.AVATAR, mediaId, profileId },
  { kind: ProfileMediaKind.HEADER, mediaId, profileId },
]);
await assert.rejects(
  db
    .insert(ProfileMedia)
    .values({ kind: ProfileMediaKind.AVATAR, mediaId: otherMediaId, profileId }),
);
```

Delete one ProfileMedia relation and assert its Media row remains. Inspect the generated migration to prove the Profile FK uses `ON DELETE CASCADE`; do not force a Profile hard delete in the runtime test because the existing `Media.profile_id` FK can independently restrict that delete.

- [ ] **Step 2: Run the targeted test and observe the missing contract**

Run:

```bash
pnpm --filter @kosmo/core test:services:database
```

Expected: compilation/test fails because `ProfileMedia` and `ProfileMediaKind` do not exist.

- [ ] **Step 3: Define enum and table**

Add the exact public enum:

```ts
export const ProfileMediaKind = {
  AVATAR: 'AVATAR',
  HEADER: 'HEADER',
} as const;
export type ProfileMediaKind = keyof typeof ProfileMediaKind;
```

Register `profile_media_kind` in `packages/core/db/enums.ts`. Add `ProfileMedia` to `tables.ts` using the existing `id()` and `createdAt()` helpers:

```ts
export const ProfileMedia = pgTable(
  'profile_media',
  {
    id: id(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => Profiles.id, { onDelete: 'cascade' }),
    mediaId: uuid('media_id')
      .notNull()
      .references(() => Media.id, { onDelete: 'cascade' }),
    kind: Enum.profileMediaKind('kind').notNull(),
    createdAt: createdAt(),
  },
  (table) => [unique().on(table.profileId, table.kind), index().on(table.mediaId)],
);
```

Do not add a unique constraint on `mediaId` and do not add backfill SQL.

- [ ] **Step 4: Generate and inspect the migration**

Run:

```bash
pnpm --filter @kosmo/core drizzle:generate --name prod_492_profile_media
```

Inspect the one directory reported by Drizzle. Its SQL must create the enum/table/FKs/unique/index only; it must not update existing Profile or Media rows.

- [ ] **Step 5: Prove schema constraints**

Run:

```bash
pnpm db:test:push
pnpm --filter @kosmo/core test:services:database
```

Expected: same Media can occupy AVATAR and HEADER; duplicate Profile/kind is rejected; relation removal preserves Media; migration SQL contains the approved Profile cascade and no backfill.

- [ ] **Step 6: Commit and push**

Commit exact enum/table/migration/test paths:

```bash
git commit -m "PROD-492 프로필 Media 관계를 추가한다"
git push
```

Update the Draft PR body: DB schema is complete; Core/API/App remain pending.

---

### Task 3: Core Profile update authorization, validation and tri-state relations

**Files:**

- Modify: `packages/core/services/profile-update.ts`
- Modify: `packages/core/services/profile-update.test.ts`
- Modify: `packages/core/validation/profile.ts`

**Interfaces:**

- Consumes: `ProfileMedia`, `ProfileMediaKind`, `Media.url`, existing selected Profile transaction.
- Produces:

```ts
export type UpdateProfileInput = {
  readonly accountId: string;
  readonly profileId: string;
  readonly avatarMediaId?: string | null;
  readonly bio?: string | null;
  readonly displayName?: string;
  readonly followPolicy?: ProfileFollowPolicy;
  readonly headerMediaId?: string | null;
  readonly tags?: readonly string[] | null;
};
```

- [ ] **Step 1: Add failing observable service tests**

Extend `profile-update.test.ts` with focused tests for:

```ts
await updateProfile({ accountId, profileId, avatarMediaId, headerMediaId: null });
```

Assert: avatar upserts; header deletes; omitted avatar/header preserve existing rows; removed relations do not delete Media; a wrong-Profile, Remote, Uploading, missing-URL or missing ID rejects the entire scalar/policy/relation update. A followPolicy-only save leaves existing Pending Follow Requests unchanged.

Add text assertions for 40 astral code points accepted, 41 rejected, exact unchanged legacy accepted, and trim-after-bio length behavior.

- [ ] **Step 2: Add a failing authorization race test**

Use two database transactions and a barrier. Hold `updateProfile` after it has acquired its eligibility row locks; attempt to remove/downgrade the Owner membership or disable the Account in the second transaction; release the first transaction and assert the second change cannot make an unauthorized partial update commit. Add the inverse ordering case where eligibility changes first and `updateProfile` rejects without changing text/policy/relations.

- [ ] **Step 3: Run the targeted Core test**

Run:

```bash
pnpm --filter @kosmo/core test:services:database
```

Expected: new media/text/race assertions fail before service changes.

- [ ] **Step 4: Move Local edit text validation behind the profile read**

Keep `profileDisplayNameSchema` unchanged for remote/shared consumers. In the service, apply this exact Local rule after loading the stored row:

```ts
const normalizeDisplayName = (next: string | undefined, current: string) => {
  if (next === undefined) return undefined;
  if (next === current) return current;
  const normalized = next.trim();
  if ([...normalized].length < 1 || [...normalized].length > 40) {
    throw new ValidationError('표시 이름은 40자 이하로 입력해 주세요.', { field: 'displayName' });
  }
  return normalized;
};
```

Normalize non-null bio with the existing `profileBioSchema` and convert schema failure to `ValidationError({ field: 'bio' })`.

- [ ] **Step 5: Lock and revalidate the complete eligibility row set**

Change the existing joined eligibility SELECT to lock its matched Profile, Instance, AccountProfile and Account rows in the transaction. Keep all existing ACTIVE/LOCAL/non-suspended/OWNER predicates. Do not trust the earlier route query or a client capability value.

- [ ] **Step 6: Validate all requested Media before writes**

Decode is an API concern; Core receives UUIDs. Load distinct requested IDs in one query and require:

```ts
eq(Media.profileId, input.profileId);
eq(Media.source, MediaSource.LOCAL);
eq(Media.state, MediaState.READY);
isNotNull(Media.url);
```

Check avatar and header independently against the returned ID set. Throw a field-specific `ValidationError` before scalar, tag or relation writes if either fails.

- [ ] **Step 7: Apply scalar/tag/relation writes atomically**

Preserve existing tag behavior for its owning follow-up, but add per-kind relation operations:

```ts
await tx
  .insert(ProfileMedia)
  .values({ profileId, mediaId, kind })
  .onConflictDoUpdate({
    target: [ProfileMedia.profileId, ProfileMedia.kind],
    set: { mediaId },
  });
```

Use delete only when the corresponding input is exactly `null`; do not touch omitted fields. Return the updated Profile row.

- [ ] **Step 8: Run Core verification**

Run:

```bash
pnpm --filter @kosmo/core test:services:database
pnpm --filter @kosmo/core test:unit
```

Expected: media tri-state, rollback, Unicode/legacy/bio and authorization race tests pass; existing tag tests pass.

- [ ] **Step 9: Commit and push**

```bash
git commit -m "PROD-492 프로필 수정을 원자적으로 저장한다"
git push
```

Update the Draft PR with Core verification and any remaining concurrency limitation.

---

### Task 4: guest-safe GraphQL capability, mutation input and Profile Media projection

**Files:**

- Create: `apps/api/src/graphql/resolvers/profile/query/selected-for-edit.ts`
- Create: `apps/api/src/graphql/resolvers/profile/loader/media.ts`
- Modify: `apps/api/src/graphql/resolvers/profile/query/index.ts`
- Modify: `apps/api/src/graphql/resolvers/profile/ref.ts`
- Modify: `apps/api/src/graphql/resolvers/profile/mutation/update.ts`
- Modify: `apps/api/src/graphql/resolvers/media/ref.ts`
- Test: `apps/api/tests/integration/graphql/profile.test.ts`

**Interfaces:**

- Consumes: Core `avatarMediaId`/`headerMediaId`, `ProfileMedia`, Profile visibility, `Media.url`.
- Produces: nullable `Query.selectedProfileForEdit`, nullable `Profile.avatar/header: Media`, nullable `Media.url`, `UpdateProfileInput.avatarId/headerId`.

- [ ] **Step 1: Add failing guest/capability tests**

In `profile.test.ts`, query public Profile and capability together:

```graphql
query ProfileEditCapability($handle: String!) {
  profileByHandle(handle: $handle) {
    id
  }
  selectedProfileForEdit {
    id
  }
}
```

Assert guest gets the public Profile plus `selectedProfileForEdit: null`; selected Owner gets the selected Profile; Member, no selected Profile and ineligible Profile get null without GraphQL errors.

- [ ] **Step 2: Add failing update/projection tests**

Create Ready Local Media fixtures with stored URLs. Call:

```graphql
mutation UpdateProfileMedia($avatarId: ID, $headerId: ID) {
  updateProfile(input: { avatarId: $avatarId, headerId: $headerId }) {
    profile {
      id
      relativeHandle
      avatar {
        id
        url
      }
      header {
        id
        url
      }
    }
  }
}
```

Assert replacement, null removal, omission, invalid global type, guest/other Account public Profile read, and standalone Media node owner restriction.

- [ ] **Step 3: Run the API integration test and observe failure**

Run:

```bash
pnpm --filter @kosmo/api test:integration:database
```

Expected: schema rejects the new query/fields/input before implementation.

- [ ] **Step 4: Implement guest-safe selectedProfileForEdit**

Use the existing nullable authenticated-query pattern:

```ts
builder.queryField('selectedProfileForEdit', (t) =>
  t.withAuth({ login: true }).field({
    type: Profile,
    nullable: true,
    unauthorizedResolver: () => null,
    resolve: async (_, __, ctx) => {
      if (!ctx.session.profileId) return null;
      // Query exact selected Profile joined to Instance, Owner membership and active Account.
    },
  }),
);
```

Return the Profile row only for Active Account + Owner + Active Local/non-suspended Profile.

- [ ] **Step 5: Implement batched Profile Media relation loading**

`profileMediaByProfileIdLoader(ctx)` loads ProfileMedia joined to Ready Media with non-null URL for all requested Profile IDs and groups by `ProfileMedia.profileId`. `Profile.avatar` and `Profile.header` find the matching kind and return that Media row directly. Do not call or weaken the standalone `MediaObject` node loader.

- [ ] **Step 6: Expose the minimal Media field and mutation inputs**

Add nullable `url` to `MediaObject`. Add optional nullable global-ID inputs:

```ts
avatarId: t.input.globalID({ for: MediaObject, required: false }),
headerId: t.input.globalID({ for: MediaObject, required: false }),
```

Map undefined/null/value without collapsing them:

```ts
avatarMediaId: input.avatarId === undefined ? undefined : input.avatarId?.id ?? null,
headerMediaId: input.headerId === undefined ? undefined : input.headerId?.id ?? null,
```

Remove the pre-read `profileDisplayNameSchema` validation from this Local mutation; Core owns the stored-value-aware rule. Keep bio and tag validation behavior.

- [ ] **Step 7: Return the complete Relay payload**

The payload `profile` resolves `id`, `relativeHandle`, scalar fields and new avatar/header relation fields through the normal Profile object. Do not add a client-only updater or a second media payload.

- [ ] **Step 8: Run API schema and integration gates**

Run:

```bash
pnpm --filter @kosmo/api lint:schema
pnpm --filter @kosmo/api lint:tsc
pnpm --filter @kosmo/api test:integration:database
```

Expected: guest query has no auth error; owner/denial/media/public read assertions pass; standalone node policy remains owner-only.

- [ ] **Step 9: Commit and push**

```bash
git commit -m "PROD-492 프로필 편집 GraphQL 계약을 연결한다"
git push
```

Update the Draft PR with GraphQL schema and integration evidence.

---

### Task 5: 공개 Profile 이미지와 조건부 편집 entrypoint

**Files:**

- Modify: `apps/app/src/components/ui/Avatar.tsx`
- Modify: `apps/app/src/components/profile/ProfileHero.tsx`
- Modify: `apps/app/src/app/(tabs)/(profile)/[profileHandle]/_layout.tsx`
- Modify: `apps/app/src/components/shell/ProfileSwitcher.tsx`
- Modify: `apps/app/src/components/profile/ProfileRoute.test.ts`
- Create: `apps/app/src/components/profile/ProfileHero.test.tsx`
- Modify: `apps/app/src/stories/Profiles.stories.tsx`

**Interfaces:**

- Consumes: `Profile.avatar/header { id url }`, `selectedProfileForEdit { id }`.
- Produces: ProfileHero URL rendering and `/profile-edit` Link only for the displayed selected Owner Profile.

- [ ] **Step 1: Add failing visibility and image tests**

Extend `ProfileRoute.test.ts` response fixtures with `selectedProfileForEdit`. Assert:

```ts
selectedProfileForEdit.id === profileByHandle.id; // renders edit Link
selectedProfileForEdit === null; // no edit control
selectedProfileForEdit.id !== profileByHandle.id; // no edit control
```

In `ProfileHero.test.tsx`, mock `useFragment` to return avatar/header URLs and assert the header Image and avatar Image sources; then return null URLs and assert fallback initials/color remain.

- [ ] **Step 2: Run App unit tests and observe failure**

Run:

```bash
pnpm --filter @kosmo/app test:unit
```

Expected: new fields/action/image assertions fail.

- [ ] **Step 3: Add optional Avatar image rendering**

Extend `AvatarProps` with `imageUri?: string | null`. Inside the existing circular container, render a cover `Image` when present and existing initial text otherwise. Preserve the existing accessibility label and callers without `imageUri`.

- [ ] **Step 4: Render Profile header/avatar URLs**

Update `ProfileHero_profile`:

```graphql
avatar { id url }
header { id url }
```

Render `header.url` as a cover Image in the cover surface and pass `avatar.url` to `Avatar`; preserve fallback colors and loading skeleton.

- [ ] **Step 5: Gate the Profile edit action by exact ID match**

Add `selectedProfileForEdit { id }` to `ProfileLayoutQuery`. Render a Link/Button with accessibility label `프로필 편집` and href `/profile-edit` only when its ID equals `profileByHandle.id`; otherwise retain the existing FollowButton action. Never render a disabled edit placeholder.

- [ ] **Step 6: Remove the stale disabled ProfileSwitcher button**

Delete the unconditional disabled edit `Pressable` in `ProfileSwitcher`. Do not replace it with another entrypoint; the public Profile route owns visibility.

- [ ] **Step 7: Compile Relay and run App tests**

Run:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app check
```

Expected: exact-ID visibility, no-placeholder and image/fallback tests pass. Confirm generated artifacts are not staged.

- [ ] **Step 8: Commit and push**

```bash
git commit -m "PROD-492 프로필 이미지를 공개 화면에 표시한다"
git push
```

Update the Draft PR with App unit/Relay evidence.

---

### Task 6: production Profile edit route, field menus, upload and save retry

**Files:**

- Create: `apps/app/src/app/(tabs)/(protected)/profile-edit.tsx`
- Create: `apps/app/src/components/profile/ProfileEditRoute.tsx`
- Create: `apps/app/src/components/profile/profileEditMedia.ts`
- Create: `apps/app/src/components/profile/profileEditMedia.test.ts`
- Create: `apps/app/src/components/profile/ProfileEditRoute.test.tsx`
- Modify: `apps/app/src/components/profile/ProfileEditScreen.tsx`
- Modify: `apps/app/src/components/profile/ProfileEditForm.tsx`
- Modify: `apps/app/src/components/profile/ProfileEditImageFields.tsx`
- Modify: `apps/app/src/components/profile/profileEditState.ts`
- Modify: `apps/app/src/components/profile/profileEditState.test.ts`
- Modify: `apps/app/src/stories/ProfileEdit.stories.tsx`

**Interfaces:**

- Consumes: controlled ProfileEdit presentation, issue/complete Media mutations, `uploadComposerMedia`, UpdateProfile GraphQL contract.
- Produces: `/profile-edit` production flow with field-local route state and no Tag payload.

Define route-only image state in `profileEditMedia.ts`:

```ts
export type ProfileEditRouteImage = {
  readonly asset: ImagePicker.ImagePickerAsset | null;
  readonly generation: number;
  readonly mediaId: string | null;
  readonly presentation: ProfileEditImageDraft;
};
```

- [ ] **Step 1: Add failing pure Media state tests**

Test initial current/empty mapping, replace generation increment, remove→null semantics, only-current-generation completion, failed-field retry preserving the other Ready ID, and Web blob preview release.

- [ ] **Step 2: Add failing route tests**

Mock Relay, Expo Router, image picker and upload callbacks. Assert:

- null `selectedProfileForEdit` renders `이 프로필을 수정할 수 없어요` and `프로필로 돌아가기`.
- query result hydrates text/policy/avatar/header preview.
- current image press offers `이미지 변경`, `이미지 삭제`, `취소`; absent image opens picker directly.
- upload failure shows `다시 시도`, disables save and never calls updateProfile.
- one Ready/one failed retry uploads only the failed field.
- updateProfile failure preserves text, policy and Ready IDs; save retry does not issue/PUT/complete again.
- submitted variables never contain `tags`.

- [ ] **Step 3: Run App unit tests and observe failure**

Run:

```bash
pnpm --filter @kosmo/app test:unit
```

Expected: route/module imports or new assertions fail.

- [ ] **Step 4: Add production-only presentation seams**

Add `showTags?: boolean` to `ProfileEditFormProps`, default it to true, and render `ProfileTagEditor` only when true. Thread through `ProfileEditScreen`. Add image callbacks:

```ts
onAvatarRemove?: () => void;
onAvatarRetry?: () => void;
onHeaderRemove?: () => void;
onHeaderRetry?: () => void;
```

`ProfileEditImageFields` uses existing `ActionMenu` for current-image change/delete/cancel and a visible `다시 시도` action for error state. If no preview exists, call the picker callback directly.

- [ ] **Step 5: Implement the route query and state hydration**

`ProfileEditRouteQuery` selects:

```graphql
currentSession {
  selectedProfile { relativeHandle }
}
selectedProfileForEdit {
  id
  relativeHandle
  displayName
  bio
  followPolicy
  avatar { id url }
  header { id url }
}
```

The protected route wraps it in `RouteBoundary`. Null capability data renders StateView; its action replaces to `/${currentSession.selectedProfile.relativeHandle}` when available or `/` otherwise. Pass `showTags={false}` and a presentation draft whose `tags` is always `[]`.

- [ ] **Step 6: Implement field-local picker/upload ownership**

Use `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false })`. On selection, increment generation, store asset and local preview, then call existing `uploadComposerMedia` with Profile-specific issue/PUT/complete callbacks. Apply completion/error only when the route is mounted and the field generation still matches. Release Web blob previews on replace/remove/unmount.

- [ ] **Step 7: Build exact update variables and save states**

Always send current displayName, trimmed/non-null bio or null, and followPolicy. For each image:

```ts
current     -> omit avatarId/headerId
removed     -> send null
replacement-> send ready mediaId
```

Never include tags. While either replacement is uploading/failed or the mutation is saving, disable save. On GraphQL/network failure set submit error without clearing route state. On success set the navigation escape flag, let Relay normalize `id + url`, then replace to `/${profile.relativeHandle}` without toast.

- [ ] **Step 8: Run Relay, unit and Storybook gates**

Run:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app build-storybook
pnpm --filter @kosmo/app test:storybook
pnpm --filter @kosmo/app check
```

Expected: existing presentation states remain, production Tag exclusion and upload/save retry assertions pass.

- [ ] **Step 9: Commit and push**

```bash
git commit -m "PROD-492 프로필 편집 route를 연결한다"
git push
```

Update the Draft PR with route/upload/Relay evidence and note orphan cleanup remains excluded.

---

### Task 7: dirty navigation confirmation and saving block

**Files:**

- Create: `apps/app/src/components/profile/ProfileEditDiscardDialog.tsx`
- Create: `apps/app/src/components/profile/useProfileEditNavigationGuard.ts`
- Modify: `apps/app/src/components/profile/ProfileEditRoute.tsx`
- Modify: `apps/app/src/components/profile/ProfileEditRoute.test.tsx`

**Interfaces:**

- Consumes: route dirty/saving state and Expo Router navigation.
- Produces: `allowNextNavigation()` plus a controlled cross-platform discard dialog.

- [ ] **Step 1: Add failing navigation tests**

Capture the `beforeRemove` listener from mocked `useNavigation`. Test route action, Web back and Android hardware-back-equivalent events with the same assertions:

```ts
event.preventDefault();
// dialog title: 변경사항을 버릴까요?
// actions: 계속 편집, 버리기
```

Assert continue keeps the draft and does not dispatch; discard dispatches the captured original action once; a second event while the dialog is open does not replace the pending action; saving prevents removal without opening the dialog; success calls `allowNextNavigation()` before `router.replace`.

- [ ] **Step 2: Run the route test and observe failure**

Run:

```bash
pnpm --filter @kosmo/app exec node --experimental-test-module-mocks --import tsx --test src/components/profile/ProfileEditRoute.test.tsx
```

Expected: guard/dialog assertions fail before implementation.

- [ ] **Step 3: Implement the accessible discard dialog**

Use React Native `Modal`, shared theme tokens and two Buttons. Exact copy:

```text
변경사항을 버릴까요?
계속 편집
버리기
```

`onRequestClose` means continue editing. Expose a single modal accessibility surface and do not use Web `window.confirm`.

- [ ] **Step 4: Implement beforeRemove ownership**

In `useProfileEditNavigationGuard`, derive the action type from `useNavigation().dispatch`, store one pending action, and subscribe to `beforeRemove`:

```ts
if (allowRef.current || !dirty) return;
event.preventDefault();
if (saving || pendingActionRef.current) return;
pendingActionRef.current = event.data.action;
setOpen(true);
```

Continue clears the pending action. Discard sets the allow ref and dispatches the exact captured action once. `allowNextNavigation()` sets the ref before success replace.

- [ ] **Step 5: Run route and App gates**

Run:

```bash
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app check
```

Expected: dirty/continue/discard/saving/success order tests pass.

- [ ] **Step 6: Commit and push**

```bash
git commit -m "PROD-492 편집 이탈을 안전하게 확인한다"
git push
```

Update the Draft PR with automated navigation evidence and list actual platform QA as pending until observed.

---

### Task 8: 통합 검증, 독립 리뷰와 PR handoff

**Files:**

- Modify only if verification reveals an approved-scope defect: files owned by Tasks 2–7
- Modify: `openspec/changes/add-local-profile-edit/tasks.md` only for checkboxes whose implementation and verification actually completed
- Modify: Draft PR body

**Interfaces:**

- Consumes: all previous task checkpoints.
- Produces: evidence-backed review handoff; OpenSpec remains active for PROD-490 archive ownership.

- [ ] **Step 1: Run database/Core/API verification**

Run:

```bash
pnpm db:test:push
pnpm --filter @kosmo/core test:services:database
pnpm --filter @kosmo/core test:unit
pnpm --filter @kosmo/api lint:schema
pnpm --filter @kosmo/api lint:tsc
pnpm --filter @kosmo/api test:integration:database
```

Record each command and result separately.

- [ ] **Step 2: Run App and repository document verification**

Run:

```bash
pnpm --filter @kosmo/app relay
pnpm --filter @kosmo/app test:unit
pnpm --filter @kosmo/app build-storybook
pnpm --filter @kosmo/app test:storybook
pnpm --filter @kosmo/app check
pnpm lint:prettier
git diff --check
pnpm exec openspec validate add-local-profile-edit --strict
```

Confirm no Relay generated artifact and no excluded Superpowers path is staged.

- [ ] **Step 3: Perform runtime QA without conflating it with automation**

Start API + Web BFF + App from the repository root with:

```bash
pnpm dev
```

After Vault OIDC, verify listening services/health. On Web, observe Owner edit-button visibility, guest/Member absence, direct ineligible StateView, current/empty image menu, one-field retry, save retry, ProfileHero result, browser back confirmation and saving block. Run iOS/Android route, picker and back checks only where a simulator/device is actually available; report unrun platforms explicitly.

- [ ] **Step 4: Dispatch the mandatory Sol medium implementation review**

Use configured `implementation_reviewer` on the complete branch diff. Require `REVIEW_PACKET_V1` and ask for correctness, scope, regression and verification-gap findings. Fix only approved-scope findings and repeat affected targeted tests plus the reviewer gate.

- [ ] **Step 5: Update OpenSpec task evidence accurately**

Check only PROD-492 tasks whose code and required automated verification passed. Do not check runtime/platform claims that were not observed. Do not archive `add-local-profile-edit`; PROD-490 owns cross-slice integration and archive.

- [ ] **Step 6: Commit and push any final approved fixes/evidence**

If files changed, create a narrow Korean commit and push immediately. Do not create an empty verification commit.

- [ ] **Step 7: Read back and update the Draft PR body**

The body must separate:

- implemented scope;
- automated commands and results;
- observed Web/iOS/Android runtime QA;
- unrun platforms and remaining risks;
- explicit exclusions;
- OpenSpec remaining active under PROD-490.

Do not mark Ready, merge, close, change base or archive without showing the final evidence and obtaining user confirmation.
