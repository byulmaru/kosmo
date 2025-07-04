import {
  Accounts,
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  first,
  firstOrThrow,
  ProfileAccounts,
  Profiles,
  Sessions,
} from '@kosmo/shared/db';
import { AccountState } from '@kosmo/shared/enums';
import { redirect } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import * as byulmaruId from '$lib/server/external/byulmaru-id';

export const GET = async ({ cookies, url }) => {
  const { code, state } = z
    .object({
      code: z.string(),
      state: z.string(),
    })
    .parse(Object.fromEntries(url.searchParams));

  if (state !== cookies.get('oauth-state')) {
    throw new Error('Invalid state');
  }

  cookies.delete('oauth-state', { path: '/' });

  const { accessToken, userInfo } = await byulmaruId.getTokens({ code });

  let accountId = await db
    .select({
      id: Accounts.id,
    })
    .from(Accounts)
    .where(
      and(eq(Accounts.providerAccountId, userInfo.sub), eq(Accounts.state, AccountState.ACTIVE)),
    )
    .then(first)
    .then((account) => account?.id);

  const token = await db.transaction(async (tx) => {
    if (accountId) {
      await tx
        .update(Accounts)
        .set({
          name: userInfo.name,
          providerSessionToken: accessToken,
        })
        .where(eq(Accounts.id, accountId));
    } else {
      accountId = await tx
        .insert(Accounts)
        .values({
          state: AccountState.ACTIVE,
          providerAccountId: userInfo.sub,
          name: userInfo.name,
          providerSessionToken: accessToken,
        })
        .returning({
          id: Accounts.id,
        })
        .then(firstOrThrow)
        .then((account) => account.id);
    }

    accountId = accountId!;

    const applicationGrant = await tx
      .insert(ApplicationGrants)
      .values({
        accountId,
        applicationId: 'APPL0WEB',
        scopes: ['$superapp'],
      })
      .onConflictDoNothing()
      .returning({
        id: ApplicationGrants.id,
      })
      .then(first);

    if (applicationGrant) {
      await tx.insert(ApplicationGrantProfiles).values({
        applicationGrantId: applicationGrant.id,
      });
    }

    const firstProfileId = await tx
      .select({
        id: Profiles.id,
      })
      .from(Profiles)
      .innerJoin(ProfileAccounts, eq(Profiles.id, ProfileAccounts.profileId))
      .where(eq(ProfileAccounts.accountId, accountId))
      .orderBy(asc(Profiles.createdAt))
      .limit(1)
      .then(first)
      .then((profile) => profile?.id);

    const session = await tx
      .insert(Sessions)
      .values({
        accountId,
        token: crypto.randomUUID(),
        profileId: firstProfileId,
        scopes: ['$superapp'],
        applicationId: 'APPL0WEB',
      })
      .returning({
        token: Sessions.token,
      })
      .then(firstOrThrow);

    return session.token;
  });

  cookies.set('accessToken', token, {
    path: '/',
    httpOnly: true,
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
  });

  return redirect(303, '/');
};
