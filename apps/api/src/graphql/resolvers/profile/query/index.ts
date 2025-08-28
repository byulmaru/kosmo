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
      handle: t.arg.string(),
    },
    resolve: async (_, args) => {
      if (args.handle.includes('@')) {
        const [handle, domain] = args.handle.split('@', 2);
        return await db
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
        return await db
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
    },
  }),
);
