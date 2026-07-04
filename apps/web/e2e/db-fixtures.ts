import { randomUUID } from 'node:crypto';
import { sessionName } from '@kosmo/core';
import {
  AccountProfiles,
  Accounts,
  db,
  firstOrThrow,
  Instances,
  pg,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { seedDatabase } from '@kosmo/core/db/seed';
import {
  AccountProfileRole,
  AccountState,
  ProfileFollowPolicy,
  ProfileState,
  SessionState,
} from '@kosmo/core/enums';
import type { BrowserContext } from '@playwright/test';

const webOrigin = 'http://127.0.0.1:4173';

type CreateE2ESessionOptions = {
  accountState?: AccountState;
  displayName?: string;
  handle?: string;
  oidcSubject?: string;
  profile?: boolean;
  sessionState?: SessionState;
  token?: string;
};

export async function resetE2EDatabase() {
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

  await seedDatabase();
}

export async function closeE2EDatabase() {
  await pg.end();
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
    const instance = await db.select().from(Instances).limit(1).then(firstOrThrow);

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

export async function setE2ESessionCookie(context: BrowserContext, token: string) {
  const origin = new URL(process.env.PUBLIC_ORIGIN ?? webOrigin);

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
