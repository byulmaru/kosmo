import { AccountProfiles, Accounts, and, db, eq, first, Profiles, Sessions } from '@kosmo/core/db';
import { AccountState, ProfileState, SessionState } from '@kosmo/core/enums';
import type { Context as HonoContext } from 'hono';

type DefaultContext = {
  ip?: string;
};

export type SessionContext = {
  session: {
    id: string;
    accountId: string;
    profileId: string | null;
  };
};

export type Context = DefaultContext & Partial<SessionContext>;
export type ServerContext = HonoContext<Env>;
export type UserContext = Context & { c: ServerContext };

export type Env = {
  Variables: { context: Context };
};

export const deriveContext = async (c: ServerContext): Promise<Context> => {
  const ctx: Context = {};

  const accessToken = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (accessToken) {
    const session = await db
      .select({
        id: Sessions.id,
        applicationId: Sessions.applicationId,
        accountId: Sessions.accountId,
        activeProfileId: Sessions.activeProfileId,
      })
      .from(Sessions)
      .innerJoin(Accounts, eq(Sessions.accountId, Accounts.id))
      .where(
        and(
          eq(Sessions.token, accessToken),
          eq(Accounts.state, AccountState.ACTIVE),
          eq(Sessions.state, SessionState.ACTIVE),
        ),
      )
      .limit(1)
      .then(first);

    if (session) {
      let profileId = c.req.header('X-Actor-Profile-Id') ?? session?.activeProfileId;
      if (profileId) {
        await db
          .select({
            id: Profiles.id,
          })
          .from(Profiles)
          .innerJoin(
            AccountProfiles,
            and(
              eq(AccountProfiles.profileId, Profiles.id),
              eq(AccountProfiles.accountId, session.accountId),
            ),
          )
          .where(and(eq(Profiles.id, profileId), eq(Profiles.state, ProfileState.ACTIVE)))
          .limit(1)
          .then(first)
          .then((profile) => {
            profileId = profile?.id ?? null;
          });
      }

      ctx.session = {
        id: session.id,
        accountId: session.accountId,
        profileId,
      };
    }
  }

  return ctx;
};
