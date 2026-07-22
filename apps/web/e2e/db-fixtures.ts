import { randomUUID } from 'node:crypto';
import { sessionName } from '@kosmo/core';
import {
  AccountProfiles,
  Accounts,
  ActivityPubActors,
  db,
  firstOrThrow,
  Instances,
  pg,
  PostContents,
  Posts,
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
  PostState,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import { postContentDocumentFromText } from '@kosmo/core/post-content/server';
import { followProfile } from '@kosmo/core/services';
import { eq } from 'drizzle-orm';
import { Temporal } from 'temporal-polyfill';
import type { BrowserContext } from '@playwright/test';

const webOrigin = process.env.PUBLIC_ORIGIN ?? 'http://127.0.0.1:4173';
let lastPostSeedTimestamp = 0;

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
  createdAt?: string;
  profileId: string;
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
    inboxUri: null,
    profileId: profile.id,
    sharedInboxUri: `https://${domain}/inbox`,
    type: ActivityPubActorType.PERSON,
    uri: `https://${domain}/users/${handle}`,
  });

  return profile;
}

export const createE2EFollow = (options: CreateE2EFollowOptions) =>
  followProfile(options).then(({ result }) => {
    if (result.kind !== 'ESTABLISHED') {
      throw new Error('E2E follow fixture requires an established relationship');
    }

    return result.profileFollow;
  });

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
        state: options.state ?? PostState.ACTIVE,
        visibility: options.visibility ?? PostVisibility.PUBLIC,
        ...(createdAt ? { createdAt } : {}),
      })
      .returning()
      .then(firstOrThrow);

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
