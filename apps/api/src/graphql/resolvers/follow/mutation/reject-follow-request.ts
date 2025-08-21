import { isActor, Reject } from '@fedify/fedify';
import {
  db,
  firstOrThrowWith,
  ProfileActivityPubActors,
  ProfileFollowRequests,
  Profiles,
} from '@kosmo/db';
import { ProfileState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
import { ForbiddenError, NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getFedifyContext } from '@/utils/fedify';

builder.mutationField('rejectFollowRequest', (t) =>
  t.withAuth({ scope: 'relationship', profile: true }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
    },

    errors: {
      types: [ForbiddenError, NotFoundError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const { followerProfile, followerActivityPubActor } = await db
        .select({
          followerProfile: Profiles,
          followerActivityPubActor: {
            uri: ProfileActivityPubActors.uri,
          },
        })
        .from(ProfileFollowRequests)
        .innerJoin(Profiles, eq(ProfileFollowRequests.profileId, Profiles.id))
        .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
        .where(
          and(
            eq(ProfileFollowRequests.profileId, input.profileId),
            eq(ProfileFollowRequests.targetProfileId, ctx.session.profileId),
            eq(Profiles.state, ProfileState.ACTIVE),
          ),
        )
        .then(firstOrThrowWith(() => new NotFoundError()));

      await db.transaction(async (tx) => {
        await tx
          .delete(ProfileFollowRequests)
          .where(
            and(
              eq(ProfileFollowRequests.profileId, followerProfile.id),
              eq(ProfileFollowRequests.targetProfileId, ctx.session.profileId),
            ),
          );

        if (followerActivityPubActor) {
          const fedifyContext = getFedifyContext();
          const followerActor = await fedifyContext.lookupObject(followerActivityPubActor.uri);

          if (!isActor(followerActor)) {
            throw new NotFoundError();
          }

          await fedifyContext.sendActivity(
            { identifier: ctx.session.profileId },
            followerActor,
            new Reject({
              actor: fedifyContext.getActorUri(ctx.session.profileId),
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
