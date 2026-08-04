import { AccountProfiles, db, Instances, Profiles } from '@kosmo/core/db';
import {
  AccountProfileRole,
  PostVisibility,
  ProfileFollowPolicy,
  ProfileMediaKind,
} from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, getColumns, inArray } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { formatRelativeHandle } from '@/profile/identity';
import { visibleProfileWhere } from '@/profile/visibility';
import { Media } from '../media/ref';
import { profileDefaultPostVisibilityLoader } from './loader/default-post-visibility';
import { profileFollowByIdLoader } from './loader/follow';
import { profileFollowRequestByIdLoader } from './loader/follow-request';
import { profileInstanceByIdLoader } from './loader/instance';
import { profileMediaLoader } from './loader/media';

export const Profile = createObjectRef('Profile', (ids) =>
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
    avatar: t.field({
      type: Media,
      nullable: true,
      grantScopes: ['readMedia'],
      resolve: (profile, _, ctx) =>
        profileMediaLoader(ctx)
          .load(profile.id)
          .then((media) => media.find(({ kind }) => kind === ProfileMediaKind.AVATAR) ?? null),
    }),
    header: t.field({
      type: Media,
      nullable: true,
      grantScopes: ['readMedia'],
      resolve: (profile, _, ctx) =>
        profileMediaLoader(ctx)
          .load(profile.id)
          .then((media) => media.find(({ kind }) => kind === ProfileMediaKind.HEADER) ?? null),
    }),
    followPolicy: t.expose('followPolicy', {
      type: ProfileFollowPolicy,
    }),
    defaultPostVisibility: t.withAuth({ login: true }).field({
      type: PostVisibility,
      nullable: true,
      resolve: (profile, _, ctx) =>
        profileDefaultPostVisibilityLoader(ctx)
          .load(profile.id)
          .then((row) => (row ? (row.defaultPostVisibility ?? PostVisibility.UNLISTED) : null)),
    }),
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});

export const ProfileConnection = builder.connectionObject(
  {
    type: Profile,
    name: 'ProfileConnection',
  },
  {
    name: 'ProfileConnectionEdge',
  },
);

export const AccountProfile = createObjectRef('AccountProfile', (ids) =>
  db.select().from(AccountProfiles).where(inArray(AccountProfiles.id, ids)),
);

AccountProfile.implement({
  fields: (t) => ({
    role: t.expose('role', {
      type: AccountProfileRole,
    }),
  }),
});

export const ProfileFollow = createObjectRef('ProfileFollow', (ids, ctx) =>
  profileFollowByIdLoader(ctx).loadMany(ids),
);

ProfileFollow.implement({
  fields: (t) => ({
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});

export const ProfileFollowRequest = createObjectRef('ProfileFollowRequest', (ids, ctx) =>
  profileFollowRequestByIdLoader(ctx).loadMany(ids),
);

ProfileFollowRequest.implement({
  fields: (t) => ({
    createdAt: t.expose('createdAt', {
      type: 'DateTime',
    }),
  }),
});
