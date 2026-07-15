import { builder } from './builder';
import type { TableDiscriminator } from '@kosmo/core/db';
import type { UserContext } from '@/context';

export const globalIdMap = new Map<number, string>();

type LoadableRow<T> = T | null | Error;

export const globalNodeRouteMap = new Map<
  string,
  (ids: string[], ctx: UserContext) => Promise<readonly unknown[]>
>();

const registerGlobalNodeRoute = <TRow extends { id: string }>(
  name: string,
  load: (ids: string[], ctx: UserContext) => Promise<readonly LoadableRow<TRow>[]>,
) => {
  const cachedLoad = async (ids: string[], ctx: UserContext): Promise<(TRow | null)[]> => {
    const loader = ctx.loader<string, TRow, string, true>({
      name: `global-node:${name}`,
      nullable: true,
      key: (row) => row?.id ?? null,
      load: async (keys) =>
        (await load(keys, ctx)).flatMap((row) => {
          if (row instanceof Error) {
            throw row;
          }

          return row ? [row] : [];
        }),
    });

    return Promise.all(ids.map((id) => loader.load(id)));
  };

  globalNodeRouteMap.set(name, cachedLoad);
  return cachedLoad;
};

export const createObjectRef = <TRow extends { id: string }>(
  name: string,
  discriminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
  load: (ids: string[], ctx: UserContext) => Promise<readonly LoadableRow<TRow>[]>,
) => {
  globalIdMap.set(discriminator, name);

  const loadCached = registerGlobalNodeRoute(name, async (ids, ctx) =>
    (await load(ids, ctx)).map((row) =>
      row && !(row instanceof Error) ? { ...row, __typename: name } : row,
    ),
  );

  return builder.loadableNodeRef(name, {
    load: loadCached as (ids: string[], ctx: UserContext) => Promise<TRow[]>,
    toKey: (obj) => obj.id,
    cacheResolved: true,
    id: { resolve: (obj) => obj.id },
  });
};

export const registerNodeRoute = <TRow extends { id: string }>(
  name: string,
  discriminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
  load: (ids: string[], ctx: UserContext) => Promise<readonly LoadableRow<TRow>[]>,
) => {
  globalIdMap.set(discriminator, name);
  registerGlobalNodeRoute(name, load);
};
