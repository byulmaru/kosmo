import { builder } from './builder';
import type { TableDiscriminator } from '@kosmo/core/db';
import type { UserContext } from '@/context';

export const globalIdMap = new Map<number, string>();

const alignByIds = <T extends { id: string }>(
  ids: readonly string[],
  rows: readonly T[],
): (T | null)[] => {
  const rowsById = new Map(rows.map((row) => [row.id, row]));

  return ids.map((id) => rowsById.get(id) ?? null);
};

export const createObjectRef = <TRow extends { id: string }>(
  name: string,
  discriminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
  load: (ids: string[], ctx: UserContext) => Promise<TRow[]>,
) => {
  globalIdMap.set(discriminator, name);

  return builder.loadableNodeRef(name, {
    load: (async (ids: string[], ctx: UserContext) => {
      const rows = await load(ids, ctx);

      return alignByIds(ids, rows);
    }) as (ids: string[], ctx: UserContext) => Promise<TRow[]>,
    toKey: (obj) => obj.id,
    cacheResolved: true,
    id: { resolve: (obj) => obj.id },
  });
};
