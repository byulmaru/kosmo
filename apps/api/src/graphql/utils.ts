import { builder } from './builder';
import type { TableDiscriminator } from '@kosmo/core/db';

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
  discirminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
  load: (ids: string[]) => Promise<TRow[]>,
) => {
  globalIdMap.set(discirminator, name);

  return builder.loadableNodeRef(name, {
    load: (async (ids: string[]) => {
      const rows = await load(ids);

      return alignByIds(ids, rows);
    }) as (ids: string[]) => Promise<TRow[]>,
    toKey: (obj) => obj.id,
    cacheResolved: true,
    id: { resolve: (obj) => obj.id },
  });
};
