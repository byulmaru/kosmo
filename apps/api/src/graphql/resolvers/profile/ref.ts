import { AccountProfiles, ProfileFollows, Profiles, TableDiscriminator } from '@kosmo/core/db';
import {
  AccountProfileRole,
  ProfileFollowPolicy,
  ProfileFollowState,
  ProfileState,
} from '@kosmo/core/enums';
import { createObjectRef } from '@/graphql/utils';

export const Profile = createObjectRef('Profile', Profiles, TableDiscriminator.Profiles);

Profile.implement({
  authScopes: (profile) => {
    return profile.state === ProfileState.ACTIVE;
  },
  fields: (t) => ({
    handle: t.exposeString('handle'),
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
  AccountProfiles,
  TableDiscriminator.AccountProfiles,
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
  ProfileFollows,
  TableDiscriminator.ProfileFollows,
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
