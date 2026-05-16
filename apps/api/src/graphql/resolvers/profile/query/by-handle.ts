import { db, first, Profiles } from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { normalizeHandle } from '@kosmo/core/utils';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.queryField('profileByHandle', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    args: {
      handle: t.arg.string({ required: true }),
    },
    resolve: async (_, args) => {
      return db
        .select()
        .from(Profiles)
        .where(
          and(
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Profiles.normalizedHandle, normalizeHandle(args.handle)),
          ),
        )
        .limit(1)
        .then(first);
    },
  }),
);
