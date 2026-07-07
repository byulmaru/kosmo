import { ActivityPubActors, db, firstOrThrowWith, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileFollowPolicy, ProfileState } from '@kosmo/core/enums';
import { ConflictError, NotFoundError } from '@kosmo/core/error';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { createProfileFollow } from '@kosmo/core/profile-follow';
import {
  createFederationContext,
  createOutboundFollowMetadata,
  sendOutboundFollowActivity,
} from '@kosmo/fedify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { ProfileFollow } from '../ref';

builder.mutationField('followProfile', (t) =>
  t.withAuth({ usingProfile: true }).fieldWithInput({
    type: builder.simpleObject('FollowProfilePayload', {
      fields: (field) => ({
        profileFollow: field.field({ type: ProfileFollow }),
      }),
    }),
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const configuredLocalInstance = await resolveConfiguredLocalInstance();
      const targetProfile = await db
        .select({
          actorUri: ActivityPubActors.uri,
          followPolicy: Profiles.followPolicy,
          id: Profiles.id,
          instanceId: Profiles.instanceId,
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
        (isRemoteProfile && targetProfile.instanceState !== InstanceState.ACTIVE)
      ) {
        throw new NotFoundError('Profile not found');
      }

      if (ctx.session.profileId === targetProfile.id) {
        throw new ConflictError({ message: 'Profile cannot follow itself', field: 'id' });
      }

      if (targetProfile.followPolicy !== ProfileFollowPolicy.OPEN) {
        throw new ConflictError({
          message: 'Profile requires follow request',
          field: 'id',
        });
      }

      if (isRemoteProfile && !targetProfile.actorUri) {
        throw new NotFoundError('Profile not found');
      }

      const federationContext = isRemoteProfile ? await createFederationContext() : null;
      const remoteFolloweeActorUri = targetProfile.actorUri;
      const { created, profileFollow } = await createProfileFollow({
        activityPubMetadata:
          federationContext && remoteFolloweeActorUri
            ? (createdProfileFollow) =>
                createOutboundFollowMetadata({
                  localFollowerProfileId: ctx.session.profileId,
                  localOrigin: new URL(federationContext.origin),
                  profileFollowId: createdProfileFollow.id,
                  remoteFolloweeActorUri,
                })
            : undefined,
        followerProfileId: ctx.session.profileId,
        followeeProfileId: targetProfile.id,
      });

      if (created && federationContext) {
        await sendOutboundFollowActivity(federationContext, profileFollow);
      }

      return { profileFollow };
    },
  }),
);
