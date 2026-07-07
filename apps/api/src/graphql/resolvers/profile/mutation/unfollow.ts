import { ActivityPubActors, db, firstOrThrowWith, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { deleteProfileFollow } from '@kosmo/core/profile-follow';
import { createFederationContext, sendOutboundUndoFollowActivity } from '@kosmo/fedify';
import { and, eq, getColumns } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { Profile } from '../ref';

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('UnfollowProfilePayload', {
      fields: (field) => ({
        profile: field.field({ type: Profile }),
        profileFollowId: field.id({ nullable: true }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const configuredLocalInstance = await resolveConfiguredLocalInstance();
      const targetProfile = await db
        .select({
          ...getColumns(Profiles),
          actorUri: ActivityPubActors.uri,
          instanceKind: Instances.kind,
          instanceState: Instances.state,
        })
        .from(Profiles)
        .leftJoin(Instances, eq(Instances.id, Profiles.instanceId))
        .leftJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
        .where(and(eq(Profiles.id, input.id), eq(Profiles.state, ProfileState.ACTIVE)))
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      const isLocalProfile =
        targetProfile.instanceId === null ||
        targetProfile.instanceId === configuredLocalInstance.id;
      const isRemoteProfile = targetProfile.instanceKind === InstanceKind.ACTIVITYPUB;

      if (
        (!isLocalProfile && !isRemoteProfile) ||
        (isRemoteProfile && targetProfile.instanceState === InstanceState.SUSPENDED)
      ) {
        throw new NotFoundError('Profile not found');
      }

      const deleted = await deleteProfileFollow({
        followerProfileId: ctx.session.profileId,
        followeeProfileId: targetProfile.id,
      });

      if (deleted && isRemoteProfile && targetProfile.instanceState === InstanceState.ACTIVE) {
        const federationContext = await createFederationContext();
        await sendOutboundUndoFollowActivity(federationContext, deleted);
      }

      return { profile: targetProfile, profileFollowId: deleted?.id ?? null };
    },
  }),
);
