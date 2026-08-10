import { AccountProfiles, Instances, Profiles } from '@kosmo/core/db';
import {
  AccountProfileRole,
  InstanceKind,
  ProfileFollowPolicy,
  ProfileMediaKind,
} from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { and, eq, exists, getColumns, inArray, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { builder } from '@/graphql/builder';
import { createObjectRef } from '@/graphql/utils';
import { formatRelativeHandle } from '@/profile/identity';
import { visibleProfileWhere } from '@/profile/visibility';
import { Media } from '../media/ref';
import { profileFollowByIdLoader } from './loader/follow';
import { profileFollowRequestByIdLoader } from './loader/follow-request';
import { profileInstanceByIdLoader } from './loader/instance';
import { profileMediaLoader } from './loader/media';

const ViewerOwnerAccountProfiles = alias(AccountProfiles, 'viewer_owner_account_profile');
const ViewerOwnerProfiles = alias(Profiles, 'viewer_owner_profile');
const ViewerOwnerInstances = alias(Instances, 'viewer_owner_instance');

export const Profile = createObjectRef('Profile', (ids, ctx) =>
  ctx.db
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

export const AccountProfile = createObjectRef('AccountProfile', (ids, ctx) => {
  const accountId = ctx.session?.accountId;
  if (!accountId) {
    return Promise.resolve([]);
  }

  return ctx.db
    .select(getColumns(AccountProfiles))
    .from(AccountProfiles)
    .where(
      and(
        inArray(AccountProfiles.id, ids),
        or(
          eq(AccountProfiles.accountId, accountId),
          exists(
            ctx.db
              .select({ id: ViewerOwnerAccountProfiles.id })
              .from(ViewerOwnerAccountProfiles)
              .innerJoin(
                ViewerOwnerProfiles,
                eq(ViewerOwnerProfiles.id, ViewerOwnerAccountProfiles.profileId),
              )
              .innerJoin(
                ViewerOwnerInstances,
                eq(ViewerOwnerInstances.id, ViewerOwnerProfiles.instanceId),
              )
              .where(
                and(
                  eq(ViewerOwnerAccountProfiles.accountId, accountId),
                  eq(ViewerOwnerAccountProfiles.profileId, AccountProfiles.profileId),
                  eq(ViewerOwnerAccountProfiles.role, AccountProfileRole.OWNER),
                  eq(ViewerOwnerInstances.kind, InstanceKind.LOCAL),
                ),
              ),
          ),
        ),
      ),
    );
});

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
