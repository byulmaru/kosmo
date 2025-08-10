import './using';

import { KOSMO_INSTANCE_ID } from '@kosmo/const';
import { db, first, Instances, Profiles } from '@kosmo/db';
import { ProfileState } from '@kosmo/enum';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
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
    resolve: async (_, args) => {
      let profile: typeof Profiles.$inferSelect | undefined;

      if (args.id) {
        profile = await db
          .select()
          .from(Profiles)
          .where(and(eq(Profiles.id, args.id), eq(Profiles.state, ProfileState.ACTIVE)))
          .then(first);
      } else if (args.handle) {
        if (args.handle.includes('@')) {
          const [handle, domain] = args.handle.split('@', 2);
          profile = await db
            .select(getTableColumns(Profiles))
            .from(Profiles)
            .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
            .where(
              and(
                eq(Instances.domain, domain),
                eq(sql`LOWER(${Profiles.handle})`, handle.toLowerCase()),
                eq(Profiles.state, ProfileState.ACTIVE),
              ),
            )
            .then(first);
        } else {
          profile = await db
            .select()
            .from(Profiles)
            .where(
              and(
                eq(Profiles.instanceId, KOSMO_INSTANCE_ID),
                eq(sql`LOWER(${Profiles.handle})`, args.handle.toLowerCase()),
                eq(Profiles.state, ProfileState.ACTIVE),
              ),
            )
            .then(first);
        }
      }

      return profile;
    },
  }),
);
