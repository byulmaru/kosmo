import { builder } from './builder';
import type { TableDiscriminator } from '@kosmo/core/db';
import type { UserContext } from '@/context';

export const globalIdMap = new Map<number, string>();

type LoadableRow<T> = T | null | Error;

const alignByIds = <T extends { id: string }>(
  ids: readonly string[],
  rows: readonly LoadableRow<T>[],
): LoadableRow<T>[] => {
  const rowsById = new Map<string, T>();
  const errorsByIndex = new Map<number, Error>();

  for (const [index, row] of rows.entries()) {
    if (row instanceof Error) {
      errorsByIndex.set(index, row);
      continue;
    }

    if (row) {
      rowsById.set(row.id, row);
    }
  }

  return ids.map((id, index) => errorsByIndex.get(index) ?? rowsById.get(id) ?? null);
};

export const createObjectRef = <TRow extends { id: string }>(
  name: string,
  discriminator: (typeof TableDiscriminator)[keyof typeof TableDiscriminator],
  load: (ids: string[], ctx: UserContext) => Promise<readonly LoadableRow<TRow>[]>,
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
