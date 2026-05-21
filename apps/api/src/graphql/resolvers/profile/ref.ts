import { AccountProfiles, db, ProfileFollows, Profiles, TableDiscriminator } from '@kosmo/core/db';
import {
  AccountProfileRole,
  ProfileFollowPolicy,
  ProfileFollowState,
  ProfileState,
} from '@kosmo/core/enums';
import { inArray } from 'drizzle-orm';
import { alignByIds, createObjectRef } from '@/graphql/utils';

export const Profile = createObjectRef(
  'Profile',
  Profiles,
  TableDiscriminator.Profiles,
  async (ids) => {
    const profiles = await db.select().from(Profiles).where(inArray(Profiles.id, ids));

    return alignByIds(ids, profiles);
  },
);

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
  async (ids) => {
    const accountProfiles = await db
      .select()
      .from(AccountProfiles)
      .where(inArray(AccountProfiles.id, ids));

    return alignByIds(ids, accountProfiles);
  },
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
  async (ids) => {
    const profileFollows = await db
      .select()
      .from(ProfileFollows)
      .where(inArray(ProfileFollows.id, ids));

    return alignByIds(ids, profileFollows);
  },
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
