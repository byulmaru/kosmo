import { Accept, isActor } from '@fedify/fedify';
import {
  db,
  firstOrThrowWith,
  ProfileActivityPubActors,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/db';
import { ProfileState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
import { ForbiddenError, NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getFedifyContext } from '@/utils/fedify';
import { getPermittedProfileId } from '@/utils/profile';

builder.mutationField('acceptFollowRequest', (t) =>
  t.withAuth({ scope: 'relationship' }).fieldWithInput({
    type: Profile,
    input: {
      followerProfileId: t.input.string(),
      actorProfileId: t.input.string({ required: false }),
    },

    errors: {
      types: [ForbiddenError, NotFoundError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const actorProfileId = await getPermittedProfileId({
        ctx,
        actorProfileId: input.actorProfileId,
      });

      const { followerProfile, followerActivityPubActor } = await db
        .select({
          followerProfile: Profiles,
          followerActivityPubActor: {
            uri: ProfileActivityPubActors.uri,
          },
        })
        .from(ProfileFollowRequests)
        .innerJoin(Profiles, eq(ProfileFollowRequests.followerProfileId, Profiles.id))
        .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
        .where(
          and(
            eq(ProfileFollowRequests.followerProfileId, input.followerProfileId),
            eq(ProfileFollowRequests.followingProfileId, actorProfileId),
            eq(Profiles.state, ProfileState.ACTIVE),
          ),
        )
        .then(firstOrThrowWith(() => new NotFoundError()));

      await db.transaction(async (tx) => {
        await tx
          .delete(ProfileFollowRequests)
          .where(
            and(
              eq(ProfileFollowRequests.followerProfileId, input.followerProfileId),
              eq(ProfileFollowRequests.followingProfileId, actorProfileId),
            ),
          );

        await tx
          .insert(ProfileFollows)
          .values({
            followerProfileId: input.followerProfileId,
            followingProfileId: actorProfileId,
          })
          .onConflictDoNothing();

        if (followerActivityPubActor) {
          const fedifyContext = getFedifyContext();
          const followerActor = await fedifyContext.lookupObject(followerActivityPubActor.uri);

          if (!isActor(followerActor)) {
            throw new NotFoundError();
          }

          await fedifyContext.sendActivity(
            { identifier: actorProfileId },
            followerActor,
            new Accept({
              actor: fedifyContext.getActorUri(actorProfileId),
              object: followerActor.id,
              to: followerActor.id,
            }),
          );
        }
      });

      return followerProfile;
    },
  }),
);
