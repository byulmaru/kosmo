# PROD-407 Reaction Profile Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 조회 가능한 Post에서 한 Reaction Type에 반응한 조회 가능한 Profile을 최신 Reaction순의 중복 없는 Relay connection으로 제공한다.

**Architecture:** `Post.reactionProfiles(type: String!): ProfileConnection!` object field가 `reaction`에서 `profile`과 `instance`를 join하고 Profile visibility를 SQL page limit 전에 적용한다. 정렬과 keyset boundary는 `(Reaction.createdAt DESC, Reaction.id DESC)`를 사용하고, 두 값을 strict base64url cursor에 넣되 connection node에는 기존 `Profile` row만 전달한다. 같은 순서를 지원하는 additive forward index를 별도 migration으로 추가한다.

**Tech Stack:** TypeScript, Pothos GraphQL/Relay, Drizzle ORM, PostgreSQL, Node test runner, OpenSpec

## Global Constraints

- 사용자 승인에 따라 선행 PR [#308](https://github.com/byulmaru/kosmo/pull/308)의 현재 head `PROD-404` 위에 `codex/prod-407`을 쌓는다. 구현 전에 PR API의 head OID와 fetch한 `origin/PROD-404` OID가 일치하는지 확인한다.
- PROD-407은 #308이 추가한 `Reaction` Node, `reactionTypeSchema`, add mutation과 integration fixture를 소비하되 그 구현을 수정하거나 대신 소유하지 않는다. #308 head가 바뀌면 PROD-407 diff와 검증을 다시 확인한 뒤 rebase한다.
- 공개 GraphQL 계약은 `Post.reactionProfiles(type: String!): ProfileConnection!`이다. `type`은 PROD-404와 같은 `reactionTypeSchema`로 canonical 여섯 Unicode 문자열만 허용한다.
- connection node는 기존 `Profile`이다. Reaction object, Reaction ID, `createdAt`/`reactedAt` edge field를 새로 공개하지 않는다.
- canonical order는 `Reaction.createdAt DESC, Reaction.id DESC`다. cursor는 두 값을 모두 포함하고 malformed/non-canonical base64url을 거부한다.
- `visibleProfileWhere`를 cursor와 `LIMIT`보다 앞선 SQL `WHERE`에 포함한다. 결과를 가져온 뒤 애플리케이션에서 숨겨진 Profile을 제거하지 않는다.
- Post visibility는 기존 `Post` Node loader를 그대로 통과한다. 별도 top-level Reaction Profile query를 만들지 않는다.
- count, delete mutation, UI, Notification, ActivityPub은 PROD-407 범위가 아니다.
- 이미 적용된 `drizzle/20260720151915_dapper_lady_mastermind` migration은 수정하지 않는다. ordering index는 additive forward migration으로만 추가한다.
- 공유 OpenSpec `add-post-reactions`는 PROD-390이 최종 통합과 archive를 소유하므로 이번 PR에서 archive하지 않는다.
- 각 GREEN checkpoint는 명시한 파일만 stage해 로컬 commit한다. 깨진 RED 상태는 commit하지 않는다. push는 사용자에게 최종 대상과 내용을 다시 보여주고 확인받은 뒤 수행한다.
- Draft PR은 사용자 확인 뒤 `PROD-404` base로 연다. 제목은 `Reaction Type별 반응 Profile을 최신순으로 조회한다`로 하고, 본문은 stacked dependency/변경 내용/이유/승인된 최신순 결정/검증/남은 PROD-390 통합 범위를 유지한다. #308 merge 뒤 `main` rebase와 PR base 변경은 별도 확인을 받는다.
- Ready 전환, 리뷰 요청, 댓글, merge, OpenSpec archive는 이 계획의 자동 실행 범위가 아니다. 각각 사용자 확인을 다시 받는다.

---

### Task 0: 선행 PR head 위 stacked 구현 기준선 확정

**Files:**

- Verify: `apps/api/src/graphql/resolvers/reaction/index.ts`
- Verify: `apps/api/src/graphql/resolvers/reaction/ref.ts`
- Verify: `apps/api/src/graphql/resolvers/reaction/mutation/add.ts`
- Verify: `apps/api/tests/integration/graphql/reaction.test.ts`
- Modify: `openspec/changes/add-post-reactions/specs/post/spec.md`
- Modify: `openspec/changes/add-post-reactions/specs/reaction/spec.md`
- Modify: `openspec/changes/add-post-reactions/decisions.md`
- Modify: `docs/superpowers/plans/2026-07-21-prod-407-reaction-profile-connection.md`

**Interfaces:**

- Consumes: PR #308의 `Reaction` Node, `reactionTypeSchema`, `addReaction(postId: ID!, type: String!)`
- Produces: 승인된 `Post.reactionProfiles(type: String!): ProfileConnection!` 계약과 최신 `main` 기반 구현 브랜치

- [x] **Step 1: PR #308의 현재 head와 base 확인**

Run:

```bash
gh pr view 308 --repo byulmaru/kosmo --json state,headRefName,headRefOid,baseRefName,url
```

Expected: `headRefName`이 `PROD-404`, `headRefOid`가 non-null, `baseRefName`이 `main`이다. `OPEN`이어도 사용자 승인에 따라 진행할 수 있지만 exact OID를 기록한다.

- [x] **Step 2: PR #308 head에서 stacked branch 생성**

현재 이 worktree의 승인된 OpenSpec/plan 변경은 지정 path만 임시 stash해 보존한 뒤 최신 base에 복원한다.

```bash
git status --short --branch
git stash push --include-untracked -m "PROD-407 approved plan" -- openspec/changes/add-post-reactions/specs/reaction/spec.md openspec/changes/add-post-reactions/decisions.md openspec/changes/add-post-reactions/design.md openspec/changes/add-post-reactions/tasks.md docs/superpowers/plans/2026-07-21-prod-407-reaction-profile-connection.md
git fetch origin PROD-404
git switch -c codex/prod-407 origin/PROD-404
git merge-base --is-ancestor refs/remotes/origin/PROD-404 HEAD
git stash pop
```

Expected: `codex/prod-407`가 확인한 #308 head OID를 포함하고, #308의 Reaction 파일과 승인된 PROD-407 OpenSpec/plan 변경이 함께 존재한다. `stash pop` 충돌이 나면 #308의 PROD-404 결정과 PROD-407의 최신순/ProfileConnection 결정을 모두 보존해 수동 병합하고 `pnpm exec openspec validate add-post-reactions --strict`로 확인한다.

- [x] **Step 3: PR #308 계약이 base에 포함됐는지 검증**

Run:

```bash
git log -1 --oneline
test -f apps/api/src/graphql/resolvers/reaction/ref.ts
test -f apps/api/tests/integration/graphql/reaction.test.ts
rg -n "reactionTypeSchema|fieldWithInput|export \{ Reaction \}" apps/api/src/graphql/resolvers/reaction packages/core/validation
```

Expected: Reaction Node/mutation/integration test와 canonical `reactionTypeSchema`가 모두 존재한다. 없으면 구현하지 않고 base drift를 보고한다.

- [x] **Step 4: 공개 field 이름과 타입을 OpenSpec에 고정**

`specs/post/spec.md`의 Profile 조회 scenario와 `specs/reaction/spec.md`의 viewer별 목록 requirement에 다음 계약을 명시한다.

```md
GraphQL API는 조회 가능한 `Post`에 `reactionProfiles(type: String!): ProfileConnection!` field를 제공해야 한다(MUST). `type`은 canonical Reaction Type 문자열 검증을 통과해야 한다(MUST).
```

`decisions.md`의 “Profile connection은 기존 Profile node만 공개한다” outcome에 같은 field signature를 추가한다. `ReactionConnection`, custom Reaction edge metadata, top-level query는 대안으로만 남긴다.

- [x] **Step 5: OpenSpec과 diff 검증**

Run:

```bash
pnpm exec openspec validate add-post-reactions --strict
git diff --check
git diff -- openspec/changes/add-post-reactions docs/superpowers/plans/2026-07-21-prod-407-reaction-profile-connection.md
```

Expected: strict validation과 whitespace check가 exit code 0이고 diff가 PROD-407 ordering/row/field 계약과 이 계획만 포함한다.

- [x] **Step 6: 계약 checkpoint local commit**

```bash
git add openspec/changes/add-post-reactions/specs/post/spec.md openspec/changes/add-post-reactions/specs/reaction/spec.md openspec/changes/add-post-reactions/decisions.md openspec/changes/add-post-reactions/design.md openspec/changes/add-post-reactions/tasks.md docs/superpowers/plans/2026-07-21-prod-407-reaction-profile-connection.md
git diff --cached
git commit -m "PROD-407 Reaction Profile 조회 계약을 확정한다"
```

Expected: local commit이 성공하고 아직 원격 branch나 Draft PR은 만들지 않는다.

---

### Task 1: 최신순 pagination ordering index 추가

**Files:**

- Modify: `packages/core/db/tables.ts`
- Modify: `packages/core/db/reaction.migration.test.mjs`
- Create: Drizzle가 `prod_407_reaction_profile_ordering` suffix로 생성한 directory의 `migration.sql`
- Create: 같은 Drizzle-generated directory의 `snapshot.json`

**Interfaces:**

- Consumes: existing unique `(post_id, type, profile_id)` and `profile_id` indexes
- Produces: additive `(post_id, type, created_at DESC, id DESC)` index supporting the public keyset order

- [ ] **Step 1: 실패하는 migration catalog assertion 작성**

`verifyCatalog`에서 non-PK index count를 3으로 바꾸고 새 index 정의를 검증한다. 아직 forward migration을 적용하지 않은 상태에서 test는 index count 2 때문에 실패해야 한다.

```js
assert.equal(indexes.length, 3);
assert.match(
  indexes.find(({ name }) => name === 'reaction_post_id_type_created_at_id_index')?.definition ??
    '',
  /CREATE INDEX .+ \(post_id, type, created_at DESC NULLS LAST, id DESC NULLS LAST\)$/,
);
```

- [ ] **Step 2: RED 확인**

Run:

```bash
pnpm --filter @kosmo/core test:migration
```

Expected: `reaction.migration.test.mjs`가 `2 !== 3` 또는 새 index definition 부재로 FAIL한다.

- [ ] **Step 3: Drizzle schema에 최소 index 선언**

`Reactions` table callback을 다음과 같이 확장한다.

```ts
(table) => [
  unique().on(table.postId, table.type, table.profileId),
  index().on(table.profileId),
  index().on(table.postId, table.type, table.createdAt.desc(), table.id.desc()),
],
```

- [ ] **Step 4: 이름이 지정된 forward migration 생성 및 test에 적용**

Run:

```bash
pnpm --filter @kosmo/core drizzle:generate --name=prod_407_reaction_profile_ordering
git status --short drizzle
```

Expected: 새 directory 하나에 `migration.sql`과 `snapshot.json`이 생성되고 SQL은 다음 한 index만 추가한다.

```sql
CREATE INDEX "reaction_post_id_type_created_at_id_index" ON "reaction" ("post_id","type","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
```

`git status --short drizzle`에 나타난 실제 directory 이름을 string literal로 사용하는 `paginationMigration` URL constant를 기존 `reactionMigration` 선언 바로 뒤에 추가하고, 기존 Reaction migration 다음에 `await sql.unsafe(await readFile(paginationMigration, 'utf8'));`로 적용한다. 추정한 timestamp나 경로 표식을 남기지 않는다. 기존 `20260720151915_dapper_lady_mastermind` SQL/snapshot은 수정하지 않는다.

- [ ] **Step 5: GREEN과 migration 회귀 확인**

Run:

```bash
pnpm --filter @kosmo/core test:migration
git diff --check
```

Expected: Reaction migration test를 포함한 모든 migration test가 PASS하고 새 index의 column/order가 catalog에서 일치한다.

- [ ] **Step 6: index checkpoint local commit**

```bash
git add packages/core/db/tables.ts packages/core/db/reaction.migration.test.mjs drizzle
git diff --cached
git commit -m "PROD-407 Reaction Profile 정렬 index를 추가한다"
```

Expected: 생성된 migration 두 파일, schema 선언, catalog test만 local commit된다.

---

### Task 2: Post Reaction Profile connection 구현

**Files:**

- Modify: `apps/api/src/graphql/schema.test.ts`
- Modify: `apps/api/src/graphql/resolvers/profile/ref.ts`
- Modify: `apps/api/src/graphql/resolvers/profile/index.ts`
- Modify: `apps/api/src/graphql/resolvers/reaction/index.ts`
- Create: `apps/api/src/graphql/resolvers/reaction/field/index.ts`
- Create: `apps/api/src/graphql/resolvers/reaction/field/post.ts`
- Modify: `apps/api/tests/integration/graphql/reaction.test.ts`

**Interfaces:**

- Consumes: `Post`, `Profile`, `ProfileConnection`, `Reactions`, `reactionTypeSchema`, `visibleProfileWhere`, `resolveCursorConnection`
- Produces: `Post.reactionProfiles(type: String!): ProfileConnection!` with opaque composite cursors and Profile-only nodes

- [ ] **Step 1: schema 계약 test 작성**

`schema.test.ts`에 exact public shape와 비노출 범위를 먼저 고정한다.

```ts
test('exposes Reaction Profiles as the shared Profile connection without Reaction metadata', () => {
  const post = schema.getType('Post');
  const connection = schema.getType('ProfileConnection');
  const edge = schema.getType('ProfileConnectionEdge');

  assert.ok(isObjectType(post));
  const field = post.getFields().reactionProfiles;
  assert.equal(String(field?.type), 'ProfileConnection!');
  assert.equal(String(field?.args.find(({ name }) => name === 'type')?.type), 'String!');

  assert.ok(isObjectType(connection));
  assert.ok(isObjectType(edge));
  assert.equal(String(edge.getFields().node.type), 'Profile!');
  assert.equal(edge.getFields().reaction, undefined);
  assert.equal(edge.getFields().reactionId, undefined);
  assert.equal(edge.getFields().reactedAt, undefined);
});
```

- [ ] **Step 2: latest/type isolation integration test 작성**

PR #308의 `reaction.test.ts` fixture를 확장해 deterministic Reaction row를 직접 삽입한다. GraphQL operation은 기존 Post Node visibility를 타도록 `node(id:)` 아래에서 field를 조회한다.

```ts
const reactionProfilesQuery = `query ReactionProfiles(
  $postId: ID!
  $type: String!
  $first: Int
  $after: String
  $last: Int
  $before: String
) {
  node(id: $postId) {
    ... on Post {
      reactionProfiles(
        type: $type
        first: $first
        after: $after
        last: $last
        before: $before
      ) {
        edges { cursor node { __typename id handle } }
        pageInfo { startCursor endCursor hasPreviousPage hasNextPage }
      }
    }
  }
}`;
```

다음 fixture로 `❤️` 결과가 최신순이고 `🎉` Profile이 섞이지 않는지 검증한다.

```ts
const oldest = await createProfile('oldest');
const newest = await createProfile('newest');
const otherType = await createProfile('other-type');
await insertReaction({
  id: '00000000-0000-8000-8000-000000000011',
  postId: post.id,
  profileId: oldest.id,
  type: '❤️',
  createdAt: '2026-07-21T00:00:00Z',
});
await insertReaction({
  id: '00000000-0000-8000-8000-000000000012',
  postId: post.id,
  profileId: newest.id,
  type: '❤️',
  createdAt: '2026-07-21T00:00:01Z',
});
await insertReaction({
  id: '00000000-0000-8000-8000-000000000013',
  postId: post.id,
  profileId: otherType.id,
  type: '🎉',
  createdAt: '2026-07-21T00:00:02Z',
});

assert.deepEqual(
  result.data?.node?.reactionProfiles.edges.map(({ node }) => node.handle),
  ['newest', 'oldest'],
);
```

`insertReaction`은 DB column type을 존중한다.

```ts
const insertReaction = ({
  createdAt,
  ...values
}: {
  createdAt: string;
  id: string;
  postId: string;
  profileId: string;
  type: string;
}) => db.insert(Reactions).values({ ...values, createdAt: Temporal.Instant.from(createdAt) });
```

- [ ] **Step 3: RED 확인**

Run:

```bash
pnpm --filter @kosmo/api test:unit
pnpm db:test:reset
pnpm db:test:push
pnpm --filter @kosmo/api exec tsx --test --test-concurrency=1 tests/integration/graphql/reaction.test.ts
```

Expected: schema test는 `reactionProfiles`/`ProfileConnection` 부재로 FAIL하고 integration query는 GraphQL field validation 오류로 FAIL한다.

- [ ] **Step 4: shared ProfileConnection 등록**

`profile/ref.ts`에서 `Profile` 정의 직후 명시적 shared connection을 만든다.

```ts
export const ProfileConnection = builder.connectionObject(
  {
    type: Profile,
    name: 'ProfileConnection',
  },
  {
    name: 'ProfileConnectionEdge',
  },
);
```

`profile/index.ts` export에 `ProfileConnection`을 추가한다.

```ts
export {
  AccountProfile,
  Profile,
  ProfileConnection,
  ProfileFollow,
  ProfileFollowRequest,
} from './ref';
```

- [ ] **Step 5: Reaction field module 조립**

`reaction/index.ts`는 field registration을 mutation과 함께 로드한다.

```ts
import './field';
import './mutation';

export { Reaction } from './ref';
```

`reaction/field/index.ts`는 Post extension만 import한다.

```ts
import './post';
```

- [ ] **Step 6: strict opaque cursor와 SQL keyset resolver 구현**

`reaction/field/post.ts`를 다음 책임으로 구현한다. helper는 PROD-407 전용이므로 별도 범용 cursor abstraction으로 올리지 않는다.

```ts
import { db, Instances, Profiles, Reactions } from '@kosmo/core/db';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { PothosValidationError } from '@pothos/core';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt, or } from 'drizzle-orm';
import { parse as parseUuid } from 'uuid';
import { builder } from '@/graphql/builder';
import { Post } from '@/graphql/resolvers/post';
import { Profile, ProfileConnection } from '@/graphql/resolvers/profile';
import { visibleProfileWhere } from '@/profile/visibility';

type ReactionProfileRow = typeof Profiles.$inferSelect & {
  readonly reactionCreatedAt: Temporal.Instant;
  readonly reactionId: string;
};

type ReactionProfileCursor = {
  readonly createdAt: Temporal.Instant;
  readonly id: string;
};

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

const encodeReactionProfileCursor = ({ reactionCreatedAt, reactionId }: ReactionProfileRow) =>
  Buffer.from(JSON.stringify([reactionCreatedAt.toString(), reactionId])).toString('base64url');

const decodeReactionProfileCursor = (cursor: string): ReactionProfileCursor => {
  try {
    if (!base64UrlPattern.test(cursor)) {
      throw new Error('Invalid base64url');
    }

    const decoded = Buffer.from(cursor, 'base64url');
    if (decoded.toString('base64url') !== cursor) {
      throw new Error('Non-canonical base64url');
    }

    const value: unknown = JSON.parse(decoded.toString('utf8'));
    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string'
    ) {
      throw new Error('Invalid cursor payload');
    }

    const [createdAt, id] = value;
    parseUuid(id);

    return { createdAt: Temporal.Instant.from(createdAt), id };
  } catch {
    throw new PothosValidationError('Invalid Reaction Profile cursor');
  }
};

const reactionProfileCursorWhere = (cursor: string | undefined, direction: 'after' | 'before') => {
  if (!cursor) {
    return undefined;
  }

  const { createdAt, id } = decodeReactionProfileCursor(cursor);

  return direction === 'after'
    ? or(
        lt(Reactions.createdAt, createdAt),
        and(eq(Reactions.createdAt, createdAt), lt(Reactions.id, id)),
      )
    : or(
        gt(Reactions.createdAt, createdAt),
        and(eq(Reactions.createdAt, createdAt), gt(Reactions.id, id)),
      );
};

builder.objectFields(Post, (t) => ({
  reactionProfiles: t.connection(
    {
      type: Profile,
      args: {
        type: t.arg.string({ required: true, validate: reactionTypeSchema }),
      },
      resolve: (post, args) =>
        resolveCursorConnection<Promise<ReactionProfileRow[]>>(
          {
            args,
            toCursor: encodeReactionProfileCursor,
          },
          ({ before, after, limit, inverted }) =>
            db
              .select({
                ...getColumns(Profiles),
                reactionCreatedAt: Reactions.createdAt,
                reactionId: Reactions.id,
              })
              .from(Reactions)
              .innerJoin(Profiles, eq(Profiles.id, Reactions.profileId))
              .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
              .where(
                and(
                  eq(Reactions.postId, post.id),
                  eq(Reactions.type, args.type),
                  visibleProfileWhere({ profile: Profiles, instance: Instances }),
                  reactionProfileCursorWhere(after, 'after'),
                  reactionProfileCursorWhere(before, 'before'),
                ),
              )
              .orderBy(
                inverted ? asc(Reactions.createdAt) : desc(Reactions.createdAt),
                inverted ? asc(Reactions.id) : desc(Reactions.id),
              )
              .limit(limit),
        ),
    },
    ProfileConnection,
  ),
}));
```

- [ ] **Step 7: GREEN 확인**

Run:

```bash
pnpm --filter @kosmo/api test:unit
pnpm db:test:reset
pnpm db:test:push
pnpm --filter @kosmo/api exec tsx --test --test-concurrency=1 tests/integration/graphql/reaction.test.ts
pnpm --filter @kosmo/api lint:tsc
```

Expected: schema, latest order, Type isolation, existing add mutation/Reaction Node integration tests가 모두 PASS하고 TypeScript 오류가 없다.

- [ ] **Step 8: connection checkpoint local commit**

```bash
git add apps/api/src/graphql/schema.test.ts apps/api/src/graphql/resolvers/profile/ref.ts apps/api/src/graphql/resolvers/profile/index.ts apps/api/src/graphql/resolvers/reaction/index.ts apps/api/src/graphql/resolvers/reaction/field apps/api/tests/integration/graphql/reaction.test.ts
git diff --cached
git commit -m "PROD-407 Type별 Reaction Profile connection을 추가한다"
```

Expected: public schema, query, cursor와 기본 integration coverage가 한 local checkpoint로 남는다.

---

### Task 3: visibility-before-limit과 양방향 page boundary 검증

**Files:**

- Modify: `apps/api/tests/integration/graphql/reaction.test.ts`
- Modify if RED reveals a defect: `apps/api/src/graphql/resolvers/reaction/field/post.ts`
- Modify: `openspec/changes/add-post-reactions/tasks.md`
- Modify: `docs/superpowers/plans/2026-07-21-prod-407-reaction-profile-connection.md`

**Interfaces:**

- Consumes: Task 2 connection
- Produces: same-timestamp tie-break, full visible pages, forward/backward pagination, hidden Post and malformed cursor evidence

- [ ] **Step 1: visibility-before-limit와 same-timestamp fixture 작성**

같은 Post/Type에 다음 canonical order를 만든다.

```text
2026-07-21T00:00:05Z suspended-instance-profile (hidden)
2026-07-21T00:00:04Z disabled-profile           (hidden)
2026-07-21T00:00:03Z visible-high-id             (visible)
2026-07-21T00:00:03Z visible-low-id              (visible)
2026-07-21T00:00:01Z visible-oldest              (visible)
```

동일 timestamp 두 row의 ID는 각각 아래 값을 사용해 ID DESC tie-break를 직접 검증한다.

```ts
const visibleHighReactionId = '00000000-0000-8000-8000-000000000024';
const visibleLowReactionId = '00000000-0000-8000-8000-000000000023';
```

첫 요청 `first: 2`는 hidden 두 row를 건너뛰고 `visible-high-id`, `visible-low-id` 두 개를 모두 채우며 `hasNextPage: true`여야 한다. `after: endCursor, first: 2`는 `visible-oldest`만 반환하고 이전 page node와 중복되지 않아야 한다.

- [ ] **Step 2: backward pagination과 cursor opacity test 작성**

첫 page의 `endCursor`가 raw Reaction UUID, raw timestamp, Profile global ID 어느 것과도 같지 않음을 확인한다. 두 번째 page의 `startCursor`를 기준으로 `last: 2, before: startCursor`를 요청해 canonical order로 첫 page를 복원하고, malformed cursor `not-a-valid-cursor`는 GraphQL error를 반환하는지 검증한다.

```ts
assert.notEqual(firstPage.pageInfo.endCursor, visibleLowReactionId);
assert.doesNotMatch(firstPage.pageInfo.endCursor, /2026-07-21/);
assert.equal(new Set([...firstHandles, ...secondHandles]).size, 3);
```

- [ ] **Step 3: Profile/Post visibility security test 작성**

- Profile state `DISABLED`와 Instance state `SUSPENDED`를 각각 넣어 둘 다 connection에서 빠지는지 검증한다.
- `PostVisibility.DIRECT` Post를 비소유 viewer가 global Node ID로 조회하면 `node: null`이고 `reactionProfiles`가 노출되지 않는지 검증한다.
- 존재하지 않는 Post global ID도 동일하게 `node: null`인지 확인해 existence oracle을 만들지 않는다.
- 허용 목록 밖 `type: "👍"`는 `VALIDATION`, `field: "type"`으로 거부되는지 검증한다.

- [ ] **Step 4: RED/GREEN 반복**

각 test 묶음을 추가한 직후 아래 명령으로 RED를 확인하고, 실패가 실제 구현 결함일 때만 `post.ts`를 최소 수정한다.

Run:

```bash
pnpm db:test:reset
pnpm db:test:push
pnpm --filter @kosmo/api exec tsx --test --test-concurrency=1 tests/integration/graphql/reaction.test.ts
```

Expected: 최종적으로 page fullness, 같은 timestamp ID DESC, forward/backward no-duplicate/no-gap, cursor rejection, Profile/Post visibility, Type validation을 모두 PASS한다.

- [ ] **Step 5: OpenSpec task 완료 표시**

증거가 모두 통과한 뒤에만 `tasks.md`를 다음처럼 갱신한다.

```md
- [x] 5.2 Type별 visible Profile connection과 필요한 forward index를 구현한다.
- [x] 5.3 visibility-before-limit과 다중 page pagination 검증을 추가하고 core/API check를 통과시킨다.
```

PROD-390이 소유한 나머지 task나 change archive 상태는 수정하지 않는다.

- [ ] **Step 6: pagination/security checkpoint local commit**

```bash
git add apps/api/tests/integration/graphql/reaction.test.ts apps/api/src/graphql/resolvers/reaction/field/post.ts openspec/changes/add-post-reactions/tasks.md docs/superpowers/plans/2026-07-21-prod-407-reaction-profile-connection.md
git diff --cached
git commit -m "PROD-407 Reaction Profile pagination을 검증한다"
```

Expected: 검증 test, 필요한 최소 수정, OpenSpec task 증거만 local commit된다.

---

### Task 4: 전체 회귀 검증과 stacked Draft PR 준비 보고

**Files:**

- Verify: all PROD-407 files above
- Verify: `openspec/changes/add-post-reactions/**`
- Modify if verification evidence changed: Draft PR body only after user-approved PR creation

**Interfaces:**

- Produces: reviewable PROD-407 local branch, complete verification evidence, user-approved stacked Draft PR proposal

- [ ] **Step 1: focused database/API verification**

Run:

```bash
pnpm --filter @kosmo/core test:migration
pnpm --filter @kosmo/api test
pnpm db:test:reset
pnpm db:test:push
pnpm --filter @kosmo/api test:integration
```

Expected: core migration catalog, API typecheck/unit/schema, 전체 API integration test가 모두 PASS한다.

- [ ] **Step 2: repository policy verification**

Run:

```bash
pnpm exec openspec validate add-post-reactions --strict
pnpm lint:eslint
pnpm lint:prettier
git diff --check
git status --short --branch
```

Expected: 모든 명령이 exit code 0이고 status에는 의도한 PROD-407 파일만 남거나 clean이다. Prettier가 실패하면 formatter로 해당 파일만 고친 뒤 같은 명령을 다시 실행한다.

- [ ] **Step 3: migration/API diff audit**

다음을 수동으로 확인한다.

- 기존 applied Reaction migration은 byte-for-byte unchanged다.
- 새 migration은 ordering index 하나만 추가한다.
- query SQL은 `visibleProfileWhere`를 `LIMIT` 전 `WHERE`에 둔다.
- `orderBy`, `after`, `before`, index의 column/order가 모두 `(createdAt, id)`로 일치한다.
- GraphQL schema에 Reaction metadata custom edge field나 top-level query가 없다.
- PROD-406 count, PROD-405 delete, PROD-418 UI, PROD-413 Notification 변경이 섞이지 않았다.

- [ ] **Step 4: push와 stacked Draft PR 생성안 제시**

사용자에게 `codex/prod-407` push, `PROD-404 <- codex/prod-407` Draft PR target과 아래 본문을 먼저 보여주고 확인받은 뒤에만 원격 상태를 변경한다.

```md
## 무엇을 변경했는지

- Post의 Reaction Type별 visible ProfileConnection
- createdAt/id 최신순 opaque keyset cursor
- ordering forward migration과 pagination/visibility integration test

## 왜 변경했는지

- PROD-407이 요구하는 중복 없는 목록과 hidden Profile에도 꽉 찬 page를 제공하기 위해

## 이번 PR의 주요 결정

- 사용자가 확정한 최신 Reaction순과 Profile-only node 계약을 OpenSpec 그대로 적용
- count 정렬은 PROD-406, UI는 PROD-418에 유지

## 어떻게 확인할 수 있는지

- 실제 실행한 command와 PASS 결과

## 아직 어떤 문제가 남았는지

- 이 PR은 #308에 stacked되어 있으며 #308 변경 시 rebase와 재검증 필요
- 공유 OpenSpec 통합/archive는 PROD-390
- 이 PR은 Draft이며 Ready 전환은 별도 확인 필요
```

확인 뒤에만 다음을 실행한다.

```bash
git push -u origin codex/prod-407
gh pr create --draft --base PROD-404 --head codex/prod-407 --title "Reaction Type별 반응 Profile을 최신순으로 조회한다" --body-file /private/tmp/prod-407-pr-body.md
```

- [ ] **Step 5: 완료 조건 보고**

다음을 사용자에게 근거와 함께 보고한다.

- 변경된 동작과 공개 schema
- migration/index와 rollback 성격(additive, drop은 별도 forward migration 필요)
- 실행한 test와 결과
- 확인하지 못한 항목
- 남은 PROD-390/406/418 범위
- Draft PR URL과 현재 review/CI 상태
- Ready 전환 여부에 대한 사용자 결정 요청
