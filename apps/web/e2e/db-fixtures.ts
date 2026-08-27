import { randomUUID } from 'node:crypto';
import { sessionName } from '@kosmo/core';
import {
  AccountProfiles,
  Accounts,
  ActivityPubActors,
  db,
  firstOrThrow,
  Hashtags,
  Instances,
  Media,
  pg,
  PostContents,
  Posts,
  ProfileHashtags,
  ProfileMedia,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { seedDatabase } from '@kosmo/core/db/seed';
import {
  AccountProfileRole,
  AccountState,
  ActivityPubActorType,
  InstanceKind,
  InstanceState,
  MediaSource,
  MediaState,
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileMediaKind,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { temporalClient } from '@kosmo/core/temporal/client';
import { executeProfileFollowPairTransition } from '@kosmo/core/temporal/follow-command';
import { eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { BrowserContext } from '@playwright/test';

const webOrigin = process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:4173';
let lastPostSeedTimestamp = 0;

const profileFollowPairWorkflowType = 'profileFollowPairWorkflow';
const profileFollowPairStatusQuery = 'profileFollowPairStatus';

type ProfileFollowPairWorkflowStatus = {
  readonly state: 'INITIAL' | 'PENDING' | 'ESTABLISHED' | 'REJECTED' | 'CANCELLED';
  readonly inFlight: boolean;
  readonly pendingEffectCount: number;
  readonly effectFailureCount: number;
};

type WorkflowInfo = {
  readonly runId: string;
  readonly type: string;
  readonly workflowId: string;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

type CreateE2ESessionOptions = {
  accountState?: AccountState;
  displayName?: string;
  handle?: string;
  oidcSubject?: string;
  profile?: boolean;
  sessionState?: SessionState;
  token?: string;
};

type CreateE2EProfileOptions = {
  displayName?: string;
  followPolicy?: ProfileFollowPolicy;
  handle?: string;
  state?: ProfileState;
};

type CreateE2EAccountProfileOptions = CreateE2EProfileOptions & {
  accountId: string;
};

type CreateE2ERemoteProfileOptions = CreateE2EProfileOptions & {
  domain?: string;
  instanceState?: InstanceState;
};

type CreateE2EFollowOptions = {
  followeeProfileId: string;
  followerProfileId: string;
};

type CreateE2EPostOptions = {
  body?: string;
  content?: boolean;
  createdAt?: string;
  profileId: string;
  replyParentId?: string;
  repostSourceId?: string;
  state?: PostState;
  visibility?: PostVisibility;
};

const toInstant = (value?: string) => (value ? Temporal.Instant.from(value) : undefined);

async function waitForNextPostSeedTimestamp() {
  while (Date.now() <= lastPostSeedTimestamp) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

export async function resetE2EDatabase() {
  await waitForE2ETemporalWorkflows();
  lastPostSeedTimestamp = 0;
  assertTestDatabaseUrl();

  await pg.unsafe(`
    DO $$
    DECLARE
      truncate_statement text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' CASCADE'
      INTO truncate_statement
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> 'instance';

      IF truncate_statement IS NOT NULL THEN
        EXECUTE truncate_statement;
      END IF;
    END $$;
  `);
  await db.delete(Instances).where(eq(Instances.kind, InstanceKind.ACTIVITYPUB));

  await seedDatabase({ publicOrigin: webOrigin });
}

async function waitForE2ETemporalWorkflows() {
  const runningWorkflows: WorkflowInfo[] = [];

  for await (const { runId, type, workflowId } of temporalClient.workflow.list({
    query: 'ExecutionStatus="Running"',
  })) {
    runningWorkflows.push({ runId, type, workflowId });
  }

  await Promise.all(runningWorkflows.map(waitForE2EWorkflow));
}

async function waitForE2EWorkflow({ runId, type, workflowId }: WorkflowInfo) {
  const handle = temporalClient.workflow.getHandle(workflowId, runId);

  if (type !== profileFollowPairWorkflowType) {
    await handle.result();
    return;
  }

  const status = await waitForE2EProfileFollowPairEffects(handle, workflowId);

  // A pair Workflow intentionally remains open while a request is pending.
  // The database is about to be truncated, so terminate that test-owned
  // lifecycle after its committed effects have drained. Terminal pairs should
  // close normally and retain their failure signal through result().
  if (status.state === 'PENDING' || status.state === 'INITIAL') {
    await handle.terminate('E2E database reset');
    return;
  }

  await handle.result();
}

async function waitForE2EProfileFollowPairEffects(
  handle: ReturnType<typeof temporalClient.workflow.getHandle>,
  workflowId: string,
): Promise<ProfileFollowPairWorkflowStatus> {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    const status = await handle.query<ProfileFollowPairWorkflowStatus>(
      profileFollowPairStatusQuery,
    );

    if (!status.inFlight && status.pendingEffectCount === 0) {
      if (status.effectFailureCount > 0) {
        throw new Error(
          `E2E Profile Follow pair ${workflowId} has ${status.effectFailureCount.toString()} failed effect(s).`,
        );
      }
      return status;
    }

    await delay(25);
  }

  throw new Error(`Timed out waiting for E2E Profile Follow pair effects: ${workflowId}`);
}

/**
 * Wait until the effects for a seeded pair transition have drained.
 *
 * This intentionally does not await Workflow result for a pending request:
 * pending pair Workflows are the durable lifecycle owner and only terminate
 * after approval, rejection, cancellation, or an inbound terminal event.
 */
export async function waitForE2EProfileFollowEffects(options: CreateE2EFollowOptions) {
  const workflowId = `profile-follow-pair:${options.followerProfileId}:${options.followeeProfileId}`;
  const handle = temporalClient.workflow.getHandle(workflowId);
  const status = await waitForE2EProfileFollowPairEffects(handle, workflowId);

  if (status.state !== 'PENDING' && status.state !== 'INITIAL') {
    await handle.result();
  }

  return status;
}

export async function closeE2EDatabase() {
  await pg.end();
}

function assertTestDatabaseUrl() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  if (
    !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) ||
    !/^kosmo_test(?:_[a-z0-9_]+)?$/.test(databaseName)
  ) {
    throw new Error(`Refusing to reset non-test database ${url.hostname}/${databaseName}.`);
  }
}

export async function createE2ESession(options: CreateE2ESessionOptions = {}) {
  const suffix = randomUUID().slice(0, 8);
  const displayName = options.displayName ?? `E2E User ${suffix}`;
  const handle = options.handle ?? `e2e-${suffix}`;
  const token = options.token ?? `e2e-session-${randomUUID()}`;

  const account = await db
    .insert(Accounts)
    .values({
      displayName,
      oidcSubject: options.oidcSubject ?? `e2e-oidc-${suffix}`,
      state: options.accountState ?? AccountState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  let profile: typeof Profiles.$inferSelect | null = null;

  if (options.profile ?? true) {
    const instance = await db
      .select()
      .from(Instances)
      .where(eq(Instances.kind, InstanceKind.LOCAL))
      .limit(1)
      .then(firstOrThrow);

    profile = await db
      .insert(Profiles)
      .values({
        displayName,
        followPolicy: ProfileFollowPolicy.OPEN,
        handle,
        instanceId: instance.id,
        normalizedHandle: handle.toLowerCase(),
        state: ProfileState.ACTIVE,
      })
      .returning()
      .then(firstOrThrow);

    await db.insert(AccountProfiles).values({
      accountId: account.id,
      profileId: profile.id,
      role: AccountProfileRole.OWNER,
    });
  }

  const session = await db
    .insert(Sessions)
    .values({
      accountId: account.id,
      activeProfileId: profile?.id ?? null,
      oidcSessionKey: `e2e-oidc-session-${suffix}`,
      state: options.sessionState ?? SessionState.ACTIVE,
      token,
    })
    .returning()
    .then(firstOrThrow);

  return { account, profile, session, token };
}

export async function createE2EProfile(options: CreateE2EProfileOptions = {}) {
  const suffix = randomUUID().slice(0, 8);
  const displayName = options.displayName ?? `E2E Profile ${suffix}`;
  const handle = options.handle ?? `e2e-profile-${suffix}`;
  const instance = await db
    .select()
    .from(Instances)
    .where(eq(Instances.kind, InstanceKind.LOCAL))
    .limit(1)
    .then(firstOrThrow);

  return await db
    .insert(Profiles)
    .values({
      displayName,
      followPolicy: options.followPolicy ?? ProfileFollowPolicy.OPEN,
      handle,
      instanceId: instance.id,
      normalizedHandle: handle.toLowerCase(),
      state: options.state ?? ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
}

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

export async function createE2EReadyProfileMedia(profileId: string, accountId: string) {
  const rows = await db
    .insert(Media)
    .values(
      [ProfileMediaKind.AVATAR, ProfileMediaKind.HEADER].map((kind) => ({
        accountId,
        mediaType: 'image/webp',
        profileId,
        readyAt: Temporal.Instant.from('2026-07-31T00:00:00Z'),
        source: MediaSource.LOCAL,
        state: MediaState.READY,
        storageReference: `e2e-profile-${kind.toLowerCase()}-${randomUUID()}`,
        uploadExpiresAt: Temporal.Instant.from('2026-07-31T00:05:00Z'),
        url: `https://media.example/e2e-profile-${kind.toLowerCase()}.webp`,
      })),
    )
    .returning();

  await db.insert(ProfileMedia).values(
    rows.map((media, index) => ({
      kind: index === 0 ? ProfileMediaKind.AVATAR : ProfileMediaKind.HEADER,
      mediaId: media.id,
      profileId,
    })),
  );

  return { avatar: rows[0]!, header: rows[1]! };
}

export async function createE2EAccountProfile(options: CreateE2EAccountProfileOptions) {
  const profile = await createE2EProfile(options);

  await db.insert(AccountProfiles).values({
    accountId: options.accountId,
    profileId: profile.id,
    role: AccountProfileRole.OWNER,
  });

  return profile;
}

export async function createE2ERemoteProfile(options: CreateE2ERemoteProfileOptions = {}) {
  const suffix = randomUUID().slice(0, 8);
  const domain = options.domain ?? `e2e-${suffix}.remote.example`;
  const handle = options.handle ?? `e2e-remote-${suffix}`;
  const instance = await db
    .insert(Instances)
    .values({
      canonicalOrigin: `https://${domain}`,
      domain,
      kind: InstanceKind.ACTIVITYPUB,
      state: options.instanceState ?? InstanceState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);
  const profile = await db
    .insert(Profiles)
    .values({
      displayName: options.displayName ?? `E2E Remote ${suffix}`,
      followPolicy: options.followPolicy ?? ProfileFollowPolicy.OPEN,
      handle,
      instanceId: instance.id,
      normalizedHandle: handle.toLowerCase(),
      state: options.state ?? ProfileState.ACTIVE,
    })
    .returning()
    .then(firstOrThrow);

  await db.insert(ActivityPubActors).values({
    inboxUri: `https://${domain}/users/${handle}/inbox`,
    profileId: profile.id,
    sharedInboxUri: `https://${domain}/inbox`,
    type: ActivityPubActorType.PERSON,
    uri: `https://${domain}/users/${handle}`,
  });

  return profile;
}

export const createE2EFollow = (options: CreateE2EFollowOptions) => {
  const pair = {
    followeeProfileId: options.followeeProfileId,
    followerProfileId: options.followerProfileId,
  };

  return executeProfileFollowPairTransition({
    pair,
    command: { kind: 'FOLLOW', origin: 'LOCAL' },
  }).then(async (transition) => {
    if (transition.result.kind !== 'ESTABLISHED' || transition.profileFollow === undefined) {
      throw new Error('E2E follow fixture requires an established relationship');
    }

    await waitForE2EProfileFollowEffects(options);
    return transition.profileFollow;
  });
};

export async function createE2EPost(options: CreateE2EPostOptions) {
  const bodyText = (options.body ?? '').trim();
  const body = postContentDocumentFromText(bodyText);
  const createdAt = toInstant(options.createdAt);

  await waitForNextPostSeedTimestamp();

  const post = await db.transaction(async (tx) => {
    const post = await tx
      .insert(Posts)
      .values({
        profileId: options.profileId,
        ...(options.replyParentId ? { replyParentId: options.replyParentId } : {}),
        ...(options.repostSourceId ? { repostSourceId: options.repostSourceId } : {}),
        state: options.state ?? PostState.ACTIVE,
        visibility: options.visibility ?? PostVisibility.PUBLIC,
        ...(createdAt ? { createdAt } : {}),
      })
      .returning()
      .then(firstOrThrow);

    if (options.content === false) {
      return post;
    }

    const content = await tx
      .insert(PostContents)
      .values({
        document: body,
        postId: post.id,
        ...(createdAt ? { createdAt } : {}),
      })
      .returning()
      .then(firstOrThrow);

    return await tx
      .update(Posts)
      .set({ currentContentId: content.id })
      .where(eq(Posts.id, post.id))
      .returning()
      .then(firstOrThrow);
  });

  lastPostSeedTimestamp = Date.now();

  return post;
}

export async function setE2ESessionCookie(context: BrowserContext, token: string) {
  const origin = new URL(webOrigin);

  await context.addCookies([
    {
      domain: origin.hostname,
      httpOnly: true,
      name: sessionName,
      path: '/',
      sameSite: 'Lax',
      secure: origin.protocol === 'https:',
      value: token,
    },
  ]);
}
