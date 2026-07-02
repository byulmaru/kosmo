import {
  AccountProfiles,
  db,
  first,
  Instances,
  Profiles,
  TableDiscriminator,
} from '@kosmo/core/db';
import {
  AccountProfileRole,
  ProfileFollowPolicy,
  ProfileFollowState,
  ProfileState,
} from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, inArray } from 'drizzle-orm';
import { createObjectRef } from '@/graphql/utils';
import { formatRelativeHandle } from '@/profile/identity';
import { profileFollowByIdLoader } from './loader/follow';

export const Profile = createObjectRef('Profile', TableDiscriminator.Profiles, (ids) =>
  db
    .select()
    .from(Profiles)
    .where(and(inArray(Profiles.id, ids), eq(Profiles.state, ProfileState.ACTIVE))),
);

Profile.implement({
  fields: (t) => ({
    handle: t.exposeString('handle'),
    relativeHandle: t.string({
      resolve: async (profile) => {
        const configuredLocalInstance = await resolveConfiguredLocalInstance();
        const profileInstanceId = profile.instanceId;

        if (!profileInstanceId || profileInstanceId === configuredLocalInstance.id) {
          return formatRelativeHandle(profile, { configuredLocalInstance });
        }

        const profileInstance = await db
          .select({ domain: Instances.domain, id: Instances.id })
          .from(Instances)
          .where(eq(Instances.id, profileInstanceId))
          .limit(1)
          .then(first);

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
    state: t.expose('state', {
      type: ProfileFollowState,
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});
