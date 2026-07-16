import { db, ProfileFollowRequests } from '@kosmo/core/db';
import { resolveCursorConnection } from '@pothos/plugin-relay';
import { and, asc, desc, eq, getColumns, gt, lt } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile, ProfileFollowRequest } from '../ref';
import type { ProfileFollowRequestRow } from '../loader/follow-request';

builder.objectFields(ProfileFollowRequest, (t) => ({
  follower: t.field({
    type: Profile,
    nullable: true,
    resolve: (request) => request.followerProfileId,
  }),
  followee: t.field({
    type: Profile,
    nullable: true,
    resolve: (request) => request.followeeProfileId,
  }),
}));

const resolveRequestConnection = async (
  profileId: string,
  participantColumn:
    | typeof ProfileFollowRequests.followerProfileId
    | typeof ProfileFollowRequests.followeeProfileId,
  args: Parameters<typeof resolveCursorConnection>[0]['args'],
) =>
  resolveCursorConnection<Promise<ProfileFollowRequestRow[]>>(
    {
      args,
      toCursor: (request) => request.id,
    },
    async ({ before, after, limit, inverted }) =>
      db
        .select(getColumns(ProfileFollowRequests))
        .from(ProfileFollowRequests)
        .where(
          and(
            eq(participantColumn, profileId),
            before ? gt(ProfileFollowRequests.id, before) : undefined,
            after ? lt(ProfileFollowRequests.id, after) : undefined,
          ),
        )
        .orderBy(inverted ? asc(ProfileFollowRequests.id) : desc(ProfileFollowRequests.id))
        .limit(limit),
  );

builder.objectFields(Profile, (t) => ({
  incomingProfileFollowRequests: t.connection({
    type: ProfileFollowRequest,
    nullable: true,
    resolve: (profile, args, ctx) =>
      ctx.session?.profileId === profile.id
        ? resolveRequestConnection(profile.id, ProfileFollowRequests.followeeProfileId, args)
        : null,
  }),
  outgoingProfileFollowRequests: t.connection({
    type: ProfileFollowRequest,
    nullable: true,
    resolve: (profile, args, ctx) =>
      ctx.session?.profileId === profile.id
        ? resolveRequestConnection(profile.id, ProfileFollowRequests.followerProfileId, args)
        : null,
  }),
}));
