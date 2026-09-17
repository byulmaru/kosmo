import {
  AccountProfiles,
  Accounts,
  ApplicationAuthorizations,
  db,
  first,
  OAuthAuthorizationCodes,
  OAuthTokens,
  Profiles,
  PushInstallations,
  Sessions,
} from '@kosmo/core/db';
import { AccountState, OAuthTokenState, ProfileState, SessionState } from '@kosmo/core/enums';
import { PermissionDeniedError } from '@kosmo/core/error';
import { and, eq, sql } from 'drizzle-orm';
import { builder } from '@/graphql/builder';

builder.mutationField('deleteAccount', (t) =>
  t.withAuth({ login: true }).field({
    type: builder.simpleObject('DeleteAccountPayload', {
      fields: (field) => ({
        completed: field.boolean(),
      }),
    }),
    resolve: async (_, __, ctx) => {
      ctx.c.header('Cache-Control', 'no-store');
      ctx.c.header('Pragma', 'no-cache');

      const completed = await db.transaction(async (tx) => {
        const account = await tx
          .select({ accountState: Accounts.state })
          .from(Accounts)
          .where(eq(Accounts.id, ctx.session.accountId))
          .limit(1)
          .for('update')
          .then(first);

        if (!account || account.accountState !== AccountState.ACTIVE) {
          throw new PermissionDeniedError();
        }

        const profiles = await tx
          .select({ state: Profiles.state })
          .from(AccountProfiles)
          .innerJoin(Profiles, eq(Profiles.id, AccountProfiles.profileId))
          .where(eq(AccountProfiles.accountId, ctx.session.accountId))
          .orderBy(Profiles.id)
          .for('update');

        if (profiles.some(({ state }) => state !== ProfileState.DISABLED)) {
          return false;
        }

        const deletedAccount = await tx
          .update(Accounts)
          .set({ state: AccountState.DISABLED })
          .where(
            and(eq(Accounts.id, ctx.session.accountId), eq(Accounts.state, AccountState.ACTIVE)),
          )
          .returning({ id: Accounts.id })
          .then(first);

        if (!deletedAccount) {
          throw new PermissionDeniedError();
        }

        await tx
          .update(Sessions)
          .set({ state: SessionState.REVOKED })
          .where(
            and(
              eq(Sessions.accountId, ctx.session.accountId),
              eq(Sessions.state, SessionState.ACTIVE),
            ),
          );

        await tx
          .update(ApplicationAuthorizations)
          .set({ revokedAt: sql`coalesce(${ApplicationAuthorizations.revokedAt}, now())` })
          .where(eq(ApplicationAuthorizations.accountId, ctx.session.accountId));

        await tx
          .update(OAuthTokens)
          .set({
            revokedAt: sql`coalesce(${OAuthTokens.revokedAt}, now())`,
            state: OAuthTokenState.REVOKED,
          })
          .where(eq(OAuthTokens.accountId, ctx.session.accountId));

        await tx
          .delete(OAuthAuthorizationCodes)
          .where(eq(OAuthAuthorizationCodes.accountId, ctx.session.accountId));

        await tx
          .delete(PushInstallations)
          .where(eq(PushInstallations.accountId, ctx.session.accountId));

        return true;
      });

      return {
        completed,
      };
    },
  }),
);
