import { AccountCoachmarks, db } from '@kosmo/core/db';
import { CoachmarkGuide } from '@kosmo/core/enums';
import { asc, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Account } from '@/graphql/resolvers/account';

builder.objectField(Account, 'seenCoachmarks', (t) =>
  t.field({
    type: [CoachmarkGuide],
    resolve: async (account) =>
      db
        .select({ guide: AccountCoachmarks.guide })
        .from(AccountCoachmarks)
        .where(eq(AccountCoachmarks.accountId, account.id))
        .orderBy(asc(AccountCoachmarks.firstShownAt), asc(AccountCoachmarks.id))
        .then((rows) => rows.map(({ guide }) => guide)),
  }),
);
