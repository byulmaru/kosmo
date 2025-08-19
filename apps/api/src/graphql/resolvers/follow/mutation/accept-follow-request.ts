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
import { and, eq, sql } from 'drizzle-orm';
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
        .innerJoin(Profiles, eq(ProfileFollowRequests.profileId, Profiles.id))
        .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
        .where(
          and(
            eq(ProfileFollowRequests.profileId, input.followerProfileId),
            eq(ProfileFollowRequests.targetProfileId, actorProfileId),
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
              eq(ProfileFollowRequests.targetProfileId, actorProfileId),
            ),
          );

        const profileFollows = await tx
          .insert(ProfileFollows)
          .values({
            profileId: followerProfile.id,
            targetProfileId: actorProfileId,
          })
          .onConflictDoNothing();

        if (profileFollows.length > 0) {
          await Promise.all([
            tx.update(Profiles).set({
              followerCount: sql`${Profiles.followerCount} + 1`,
            }).where(eq(Profiles.id, actorProfileId)),
            tx.update(Profiles).set({
              followingCount: sql`${Profiles.followingCount} + 1`,
            }).where(eq(Profiles.id, followerProfile.id)),
          ]);
        }

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
