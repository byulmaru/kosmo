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
import { decodeGlobalId } from '@kosmo/core/global-id';
import DataLoader from 'dataloader';
import { and, eq } from 'drizzle-orm';
import stringify from 'fast-json-stable-stringify';
import * as R from 'remeda';
import { visibleProfileWhere } from './profile/visibility';
import type { AccountProfileRole } from '@kosmo/core/enums';
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
    profile: { id: string; role: AccountProfileRole } | null;
  };
};

export type SessionWithProfileContext = SessionContext & {
  session: {
    profile: { id: string; role: AccountProfileRole };
  };
};

export type Context = DefaultContext & Partial<SessionContext>;
export type ServerContext = HonoContext<Env>;
export type UserContext = Context & { c: ServerContext };

export type Env = {
  Variables: { context: Context };
};

const findVisibleProfile = async (
  accountId: string,
  profileId: string,
): Promise<{ id: string; role: AccountProfileRole } | null> =>
  db
    .select({
      id: Profiles.id,
      role: AccountProfiles.role,
    })
    .from(Profiles)
    .innerJoin(
      AccountProfiles,
      and(eq(AccountProfiles.profileId, Profiles.id), eq(AccountProfiles.accountId, accountId)),
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
    .then((selectedProfile) => selectedProfile ?? null);

export const deriveContext = async (c: ServerContext): Promise<Context> => {
  const ctx = createContext();

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
      let profile: { id: string; role: AccountProfileRole } | null = null;
      if (session.activeProfileId) {
        profile = await findVisibleProfile(session.accountId, session.activeProfileId);
      }

      ctx.session = {
        id: session.id,
        accountId: session.accountId,
        profile,
      };
    }
  }

  return ctx;
};

const getSelectedProfileId = (extensions: unknown): string | null => {
  if (typeof extensions !== 'object' || extensions === null || Array.isArray(extensions)) {
    return null;
  }

  const selectedProfileId = (extensions as Record<string, unknown>).selectedProfileId;
  if (typeof selectedProfileId !== 'string') {
    return null;
  }

  try {
    const decoded = decodeGlobalId(selectedProfileId);
    return decoded.typename === 'Profile' ? decoded.id : null;
  } catch {
    return null;
  }
};

export const applySelectedProfileExtension = async (
  ctx: Context,
  extensions: unknown,
): Promise<void> => {
  const selectedProfileId = getSelectedProfileId(extensions);
  if (!selectedProfileId || !ctx.session) {
    return;
  }

  const selectedProfile = await findVisibleProfile(ctx.session.accountId, selectedProfileId);

  if (selectedProfile) {
    ctx.session.profile = selectedProfile;
  }
};

const createContext = (): Context => {
  const ctx = {
    $loaders: new Map<string, DataLoader<unknown, unknown>>(),
  } as Context;

  ctx.loader = (params) => {
    const { name, nullable, many, load, key } = params;
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
  };

  return ctx;
};
