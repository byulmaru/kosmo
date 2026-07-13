import {
  AccountProfiles,
  Accounts,
  db,
  first,
  Instances,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { AccountState, SessionState } from '@kosmo/core/enums';
import DataLoader from 'dataloader';
import { and, eq } from 'drizzle-orm';
import stringify from 'fast-json-stable-stringify';
import * as R from 'remeda';
import { visibleProfileWhere } from './profile/visibility';
import type { Context as HonoContext } from 'hono';

type LoaderParams<Key, Result, SortKey, Nullability extends boolean, Many extends boolean> = {
  name: string;
  nullable?: Nullability;
  many?: Many;
  key: (
    value: Nullability extends true ? Result | null : Result,
  ) => Nullability extends true ? SortKey | null : SortKey;
  load: (keys: Key[]) => Promise<Result[]>;
};

type DefaultContext = {
  ip?: string;
  loader: <
    Key = string,
    Result = unknown,
    SortKey = Key,
    Nullability extends boolean = false,
    Many extends boolean = false,
    MaybeResult = Nullability extends true ? Result | null : Result,
    FinalResult = Many extends true ? MaybeResult[] : MaybeResult,
  >(
    params: LoaderParams<Key, Result, SortKey, Nullability, Many>,
  ) => DataLoader<Key, FinalResult, string>;
  $loaders: Map<string, DataLoader<unknown, unknown>>;
};

export type SessionContext = {
  session: {
    id: string;
    accountId: string;
    profileId: string | null;
  };
};

export type SessionWithProfileContext = SessionContext & {
  session: {
    profileId: string;
  };
};

export type Context = DefaultContext & Partial<SessionContext>;
export type ServerContext = HonoContext<Env>;
export type UserContext = Context & { c: ServerContext };

export type Env = {
  Variables: { context: Context };
};

export const deriveContext = async (c: ServerContext): Promise<Context> => {
  const ctx: Context = {
    loader: ({ name, nullable, many, load, key }) => {
      const cached = ctx.$loaders.get(name);
      if (cached) {
        return cached as never;
      }

      const loader = new DataLoader(
        async (keys) => {
          const rows = await load(keys as never);
          const values = R.groupBy(rows, (row) => stringify(key(row as never)));

          return keys.map((key) => {
            const value = values[stringify(key)];
            if (value?.length) {
              return many ? value : value[0];
            }

            if (nullable) {
              return null;
            }

            if (many) {
              return [];
            }

            return new Error(`DataLoader(${name}): Missing key`);
          });
        },
        { cache: false },
      );

      ctx.$loaders.set(name, loader);

      return loader as never;
    },
    $loaders: new Map(),
  };

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
      let profileId = session.activeProfileId;
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
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(Profiles.id, profileId),
              visibleProfileWhere({ profile: Profiles, instance: Instances }),
            ),
          )
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
