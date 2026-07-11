import { AccountProfiles, db, Instances, Profiles, TableDiscriminator } from '@kosmo/core/db';
import { AccountProfileRole, ProfileFollowPolicy, ProfileOrigin } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';
import { formatRelativeHandle, getProfileOrigin } from '@/profile/identity';
import { visibleProfileWhere } from './access/visibility';
import { profileFollowByIdLoader } from './loader/follow';
import { profileInstanceByIdLoader } from './loader/instance';

export const Profile = createObjectRef('Profile', TableDiscriminator.Profiles, (ids) =>
  db
    .select(getColumns(Profiles))
    .from(Profiles)
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        inArray(Profiles.id, ids),
        visibleProfileWhere({ profile: Profiles, instance: Instances }),
      ),
    ),
);

Profile.implement({
  fields: (t) => ({
    handle: t.exposeString('handle'),
    origin: t.field({
      type: ProfileOrigin,
      resolve: async (profile) => {
        const configuredLocalInstance = await resolveConfiguredLocalInstance();

        return getProfileOrigin(profile, configuredLocalInstance);
      },
    }),
    relativeHandle: t.string({
      resolve: async (profile, _, ctx) => {
        const configuredLocalInstance = await resolveConfiguredLocalInstance();
        const profileInstanceId = profile.instanceId;

        if (profileInstanceId === configuredLocalInstance.id) {
          return formatRelativeHandle(profile, { configuredLocalInstance });
        }

        const profileInstance = await profileInstanceByIdLoader(ctx).load(profileInstanceId);

        return formatRelativeHandle(profile, { configuredLocalInstance, profileInstance });
      },
    }),
    displayName: t.exposeString('displayName'),
    bio: t.exposeString('bio', { nullable: true }),
    followPolicy: t.expose('followPolicy', {
      type: ProfileFollowPolicy,
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});

export const AccountProfile = createObjectRef(
  'AccountProfile',
  TableDiscriminator.AccountProfiles,
  (ids) => db.select().from(AccountProfiles).where(inArray(AccountProfiles.id, ids)),
);

AccountProfile.implement({
  fields: (t) => ({
    role: t.expose('role', {
      type: AccountProfileRole,
    }),
  }),
});

export const ProfileFollow = createObjectRef(
  'ProfileFollow',
  TableDiscriminator.ProfileFollows,
  (ids, ctx) => profileFollowByIdLoader(ctx).loadMany(ids),
);

ProfileFollow.implement({
  fields: (t) => ({
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});
