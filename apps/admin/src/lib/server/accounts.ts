import { Accounts, db, first } from '@kosmo/core/db';
import { asc, desc, eq, gt, lt } from 'drizzle-orm';
import { z } from 'zod';

export const accountIdSchema = z.uuid();

const pageSize = 50;

export const listAccounts = async (cursor?: string, direction: 'next' | 'previous' = 'next') => {
  const rows = await db
    .select({
      id: Accounts.id,
      displayName: Accounts.displayName,
      state: Accounts.state,
      createdAt: Accounts.createdAt,
    })
    .from(Accounts)
    .where(
      cursor
        ? direction === 'previous'
          ? gt(Accounts.id, cursor)
          : lt(Accounts.id, cursor)
        : undefined,
    )
    .orderBy(direction === 'previous' ? asc(Accounts.id) : desc(Accounts.id))
    .limit(pageSize + 1);
  const hasNextPage = rows.length > pageSize;
  const accounts = (
    direction === 'previous' ? rows.slice(0, pageSize).reverse() : rows.slice(0, pageSize)
  ).map(({ createdAt, ...account }) => ({ ...account, createdAt: createdAt.toString() }));

  const firstAccount = accounts.at(0);
  const lastAccount = accounts.at(-1);
  const previousPage =
    direction === 'next' && cursor && firstAccount
      ? await db
          .select({ id: Accounts.id })
          .from(Accounts)
          .where(gt(Accounts.id, cursor))
          .orderBy(asc(Accounts.id))
          .limit(1)
          .then(first)
      : undefined;
  const nextPage =
    direction === 'previous' && lastAccount
      ? await db
          .select({ id: Accounts.id })
          .from(Accounts)
          .where(lt(Accounts.id, lastAccount.id))
          .orderBy(desc(Accounts.id))
          .limit(1)
          .then(first)
      : undefined;

  return {
    accounts,
    previousCursor:
      direction === 'previous'
        ? hasNextPage
          ? (firstAccount?.id ?? null)
          : null
        : previousPage && firstAccount
          ? firstAccount.id
          : null,
    nextCursor:
      direction === 'previous'
        ? nextPage && lastAccount
          ? lastAccount.id
          : null
        : hasNextPage
          ? (lastAccount?.id ?? null)
          : null,
  };
};

export const getAccount = async (id: string) => {
  const account = await db
    .select({
      id: Accounts.id,
      displayName: Accounts.displayName,
      state: Accounts.state,
      createdAt: Accounts.createdAt,
      oidcSubject: Accounts.oidcSubject,
    })
    .from(Accounts)
    .where(eq(Accounts.id, id))
    .limit(1)
    .then(first);

  return account ? { ...account, createdAt: account.createdAt.toString() } : undefined;
};
