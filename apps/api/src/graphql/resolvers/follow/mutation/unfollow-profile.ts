import { Follow, isActor, Undo } from '@fedify/fedify';
import {
  db,
  firstOrThrowWith,
  ProfileActivityPubActors,
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

builder.mutationField('unfollowProfile', (t) =>
  t.withAuth({ scope: 'relationship' }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
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

      const { targetProfile, activityPubActor } = await db
        .select({
          targetProfile: Profiles,
          activityPubActor: {
            uri: ProfileActivityPubActors.uri,
          },
        })
        .from(Profiles)
        .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
        .where(and(eq(Profiles.id, input.profileId), eq(Profiles.state, ProfileState.ACTIVE)))
        .then(firstOrThrowWith(() => new NotFoundError()));

      await db.transaction(async (tx) => {
        const profileFollows = await tx
          .delete(ProfileFollows)
          .where(
            and(
              eq(ProfileFollows.profileId, actorProfileId),
              eq(ProfileFollows.targetProfileId, input.profileId),
            ),
          )
          .returning({ id: ProfileFollows.id });

        if (profileFollows.length > 0) {
          await Promise.all([
            tx
              .update(Profiles)
              .set({
                followerCount: sql`${Profiles.followerCount} - 1`,
              })
              .where(eq(Profiles.id, targetProfile.id)),
            tx
              .update(Profiles)
              .set({
                followingCount: sql`${Profiles.followingCount} - 1`,
              })
              .where(eq(Profiles.id, actorProfileId)),
          ]);

          if (activityPubActor) {
            const fedifyContext = getFedifyContext();
            const targetActor = await fedifyContext.lookupObject(activityPubActor.uri);

            if (!isActor(targetActor)) {
              throw new NotFoundError();
            }

            await fedifyContext.sendActivity(
              { identifier: actorProfileId },
              targetActor,
              new Undo({
                actor: fedifyContext.getActorUri(actorProfileId),
                to: targetActor.id,
                object: new Follow({
                  actor: fedifyContext.getActorUri(actorProfileId),
                  object: targetActor.id,
                }),
              }),
            );
          }
        }
      });

      return targetProfile;
    },
  }),
);
