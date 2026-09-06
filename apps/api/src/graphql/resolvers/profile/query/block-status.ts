import { db, first, Instances, ProfileBlocks, Profiles } from '@kosmo/core/db';
import { InstanceKind } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { parseProfileHandle } from '@kosmo/core/profile';
import { profileBlockPairWhere } from '@kosmo/core/visibility';
import { and, eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { requireSelectedLocalProfile } from '../access/block';
import { ProfileBlock } from '../ref';

type ProfileBlockStatusRow = {
  readonly blocking: boolean;
  readonly blockedBy: boolean;
  readonly profileBlockId: string | null;
};

const ProfileBlockStatus = builder.objectRef<ProfileBlockStatusRow>('ProfileBlockStatus');

ProfileBlockStatus.implement({
  fields: (t) => ({
    blocking: t.exposeBoolean('blocking'),
    blockedBy: t.exposeBoolean('blockedBy'),
    profileBlockId: t.globalID({
      nullable: true,
      resolve: (status) =>
        status.profileBlockId ? { id: status.profileBlockId, type: ProfileBlock } : null,
    }),
  }),
});

const emptyStatus = (): ProfileBlockStatusRow => ({
  blocking: false,
  blockedBy: false,
  profileBlockId: null,
});

builder.queryField('profileBlockStatus', (t) =>
  t.withAuth({ usingProfile: true }).field({
    type: ProfileBlockStatus,
    args: {
      handle: t.arg.string({ required: true }),
    },
    resolve: async (_, args, ctx) => {
      const selected = await requireSelectedLocalProfile(ctx);
      const localInstance = await resolveConfiguredLocalInstance();
      const parsed = parseProfileHandle(args.handle, {
        configuredLocalDomain: localInstance.domain,
      });
      if (!parsed) {
        return emptyStatus();
      }

      const target = await db
        .select({ id: Profiles.id })
        .from(Profiles)
        .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .where(
          and(
            parsed.kind === 'remote'
              ? and(
                  eq(Instances.domain, parsed.domain),
                  eq(Instances.kind, InstanceKind.ACTIVITYPUB),
                )
              : and(eq(Instances.id, localInstance.id), eq(Instances.kind, InstanceKind.LOCAL)),
            eq(Profiles.normalizedHandle, parsed.normalizedHandle),
          ),
        )
        .limit(1)
        .then(first);
      if (!target || target.id === selected.id) {
        return emptyStatus();
      }

      const relations = await db
        .select({
          id: ProfileBlocks.id,
          ownerProfileId: ProfileBlocks.ownerProfileId,
        })
        .from(ProfileBlocks)
        .where(profileBlockPairWhere(selected.id, target.id));
      const ownBlock = relations.find(({ ownerProfileId }) => ownerProfileId === selected.id);
      const otherBlock = relations.find(({ ownerProfileId }) => ownerProfileId === target.id);

      return {
        blocking: ownBlock !== undefined,
        blockedBy: otherBlock !== undefined,
        profileBlockId: ownBlock?.id ?? null,
      };
    },
  }),
);
