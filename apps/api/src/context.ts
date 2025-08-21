import { getConnInfo } from '@hono/node-server/conninfo';
import {
  Accounts,
  ApplicationGrantProfiles,
  ApplicationGrants,
  db,
  first,
  ProfileAccounts,
  Profiles,
  Sessions,
} from '@kosmo/db';
import { ProfileState } from '@kosmo/enum';
import { getLanguagesByAcceptLanguageHeader } from '@kosmo/i18n';
import DataLoader from 'dataloader';
import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import stringify from 'fast-json-stable-stringify';
import IPAddr from 'ipaddr.js';
import * as R from 'remeda';
import type { LANGUAGE_LIST } from '@kosmo/i18n';
import type { Scope } from '@kosmo/type';
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

export type ServerContext = HonoContext<Env>;

type DefaultContext = {
  ip: string;
  languages: LANGUAGE_LIST[];

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
  ' $loaders': Map<string, DataLoader<unknown, unknown>>;
};

export type SessionContext = {
  session: {
    id: string;
    applicationId: string;
    accountId: string;
    scopes: Scope[];
    profileId: string | null;
  };
};

export type Context = DefaultContext & Partial<SessionContext>;

export type UserContext = Context & {
  c: ServerContext;
};

export type Env = {
  Variables: { context: Context };
};

export const deriveContext = async (c: ServerContext): Promise<Context> => {
  const ctx: Context = {
    ip: getClientAddress(c),
    languages: getLanguagesByAcceptLanguageHeader(c.req.header('Accept-Language')),
    loader: ({ name, nullable, many, load, key }) => {
      const cached = ctx[' $loaders'].get(name);
      if (cached) {
        return cached as never;
      }

      const loader = new DataLoader(
        async (keys) => {
          const rows = await load(keys as never);
          const values = R.groupBy(rows, (row) => stringify(key(row)));
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

      ctx[' $loaders'].set(name, loader);

      return loader as never;
    },
    ' $loaders': new Map(),
  };

  const accessToken = c.req.header('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (accessToken) {
    const headerProfileId = c.req.header('X-Actor-Profile-Id');
    const session = await db
      .select({
        id: Sessions.id,
        applicationId: Sessions.applicationId,
        accountId: Sessions.accountId,
        scopes: Sessions.scopes,
        languages: Accounts.languages,
        profileId: Profiles.id,
      })
      .from(Sessions)
      .innerJoin(Accounts, eq(Sessions.accountId, Accounts.id))
      .innerJoin(
        ApplicationGrants,
        and(
          eq(ApplicationGrants.accountId, Sessions.accountId),
          eq(ApplicationGrants.applicationId, Sessions.applicationId),
        ),
      )
      .leftJoin(
        ApplicationGrantProfiles,
        eq(ApplicationGrants.id, ApplicationGrantProfiles.applicationGrantId),
      )
      .leftJoin(
        ProfileAccounts,
        and(
          eq(Sessions.accountId, ProfileAccounts.accountId),
          eq(ProfileAccounts.profileId, headerProfileId ?? Sessions.profileId),
        ),
      )
      .leftJoin(
        Profiles,
        and(
          eq(Profiles.id, ProfileAccounts.profileId),
          eq(Profiles.state, ProfileState.ACTIVE),
          isNotNull(ApplicationGrantProfiles.id),
          or(
            eq(ApplicationGrantProfiles.profileId, Profiles.id),
            isNull(ApplicationGrantProfiles.profileId),
          ),
        ),
      )
      .where(eq(Sessions.token, accessToken))
      .limit(1)
      .then(first);

    if (session) {
      ctx.session = {
        id: session.id,
        applicationId: session.applicationId,
        accountId: session.accountId,
        scopes: session.scopes ?? [],
        profileId: session.profileId,
      };

      ctx.languages = session.languages;
    }
  }

  return ctx;
};

export const getClientAddress = (c: HonoContext) => {
  try {
    const xff = c.req.header('X-Forwarded-For');
    if (xff) {
      const ip = R.pipe(
        xff,
        R.split(','),
        R.map((v) => v.trim()),
        R.filter((v) => IPAddr.isValid(v)),
        R.map((v) => IPAddr.process(v)),
        R.findLast((v) => v.range() !== 'private'),
      );

      if (ip) {
        return ip.toString();
      }
    }

    const ip = getConnInfo(c).remote.address;
    if (ip) {
      return IPAddr.process(ip).toString();
    }
  } catch {
    // pass
  }

  return '0.0.0.0';
};
