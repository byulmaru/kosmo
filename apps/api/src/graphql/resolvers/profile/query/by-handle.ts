import { db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import { and, eq, getColumns } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { visibleProfileWhere } from '@/profile/visibility';
import { Profile } from '../ref';

builder.queryField('profileByHandle', (t) =>
  t.field({
    type: Profile,
    nullable: true,
    args: {
      handle: t.arg.string({ required: true }),
    },
    resolve: async (_, args) => {
      const localInstance = await resolveConfiguredLocalInstance();
      const parsed = parseProfileHandle(args.handle, {
        configuredLocalDomain: localInstance.domain,
      });

      if (!parsed) {
        return null;
      }

      if (parsed.kind === 'remote') {
        return db
          .select(getColumns(Profiles))
          .from(Profiles)
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .where(
            and(
              eq(Instances.domain, parsed.domain),
              eq(Instances.kind, InstanceKind.ACTIVITYPUB),
              eq(Profiles.normalizedHandle, parsed.normalizedHandle),
              visibleProfileWhere({ profile: Profiles, instance: Instances }),
            ),
          )
          .limit(1)
          .then(first);
      }

      return db
        .select(getColumns(Profiles))
        .from(Profiles)
        .where(
          and(
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(Profiles.instanceId, localInstance.id),
            eq(Profiles.normalizedHandle, parsed.normalizedHandle),
          ),
        )
        .limit(1)
        .then(first);
    },
  }),
);
