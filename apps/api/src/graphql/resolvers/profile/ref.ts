import { AccountProfiles, db, Profiles, TableDiscriminator } from '@kosmo/core/db';
import { AccountProfileRole, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { formatRelativeHandle } from '@/profile/identity';
import { profileFollowByIdLoader } from './loader/follow';
import { profileFollowRequestByIdLoader } from './loader/follow-request';
import { profileInstanceByIdLoader } from './loader/instance';

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
      resolve: async (profile, _, ctx) => {
        const configuredLocalInstance = await resolveConfiguredLocalInstance();
        const profileInstanceId = profile.instanceId;

        if (!profileInstanceId || profileInstanceId === configuredLocalInstance.id) {
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

export const ProfileFollowRequest = createObjectRef(
  'ProfileFollowRequest',
  TableDiscriminator.ProfileFollowRequests,
  (ids, ctx) => profileFollowRequestByIdLoader(ctx).loadMany(ids),
);

ProfileFollowRequest.implement({
  fields: (t) => ({
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});

export const ProfileFollowRequestConnection = builder.connectionObject(
  {
    type: ProfileFollowRequest,
    name: 'ProfileFollowRequestConnection',
  },
  {
    name: 'ProfileFollowRequestConnectionEdge',
  },
);
