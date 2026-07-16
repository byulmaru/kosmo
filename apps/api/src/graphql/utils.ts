import { builder } from './builder';
import type { UserContext } from '@/context';

type LoadableRow<T> = T | null | Error;

const alignByIds = <T extends { id: string }>(
  ids: readonly string[],
  rows: readonly LoadableRow<T>[],
): (T | null)[] => {
  const rowsById = new Map<string, T>();

  for (const row of rows) {
    if (row instanceof Error) {
      throw row;
    }

    if (row) {
      rowsById.set(row.id, row);
    }
  }

  return ids.map((id) => rowsById.get(id) ?? null);
};

export const createObjectRef = <TRow extends { id: string }>(
  name: string,
  load: (ids: string[], ctx: UserContext) => Promise<readonly LoadableRow<TRow>[]>,
) =>
  builder.loadableNodeRef(name, {
    load: (async (ids: string[], ctx: UserContext) => {
      const rows = await load(ids, ctx);

      return alignByIds(ids, rows);
    }) as (ids: string[], ctx: UserContext) => Promise<TRow[]>,
    toKey: (obj) => obj.id,
    cacheResolved: true,
    id: { resolve: (obj) => obj.id },
  });
