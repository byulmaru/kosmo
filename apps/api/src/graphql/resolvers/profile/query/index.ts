import './using';

import { db, first, Profiles } from '@kosmo/shared/db';
import { ProfileState } from '@kosmo/shared/enums';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.queryField('profile', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    args: {
      id: t.arg.string({ required: false }),
      handle: t.arg.string({ required: false }),
    },
    resolve: async (_, { id, handle }) => {
      const condition = id ? eq(Profiles.id, id) : handle ? eq(Profiles.handle, handle) : null;
      if (!condition) {
        return null;
      }

      const profile = await db
        .select()
        .from(Profiles)
        .where(and(condition, eq(Profiles.state, ProfileState.ACTIVE)))
        .then(first);

      return profile;
    },
  }),
);
