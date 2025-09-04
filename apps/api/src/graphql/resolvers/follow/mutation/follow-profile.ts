import { Follow, isActor } from '@fedify/fedify';
import {
  db,
  firstOrThrowWith,
  ProfileActivityPubActors,
  ProfileFollowRequests,
  ProfileFollows,
  Profiles,
} from '@kosmo/db';
import { ProfileFollowAcceptMode, ProfileState } from '@kosmo/enum';
import { and, eq, sql } from 'drizzle-orm';
import { match } from 'ts-pattern';
import { ForbiddenError, NotFoundError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getFedifyContext } from '@/utils/fedify';

builder.mutationField('followProfile', (t) =>
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
      if (ctx.session.profileId === input.profileId) {
        throw new ForbiddenError();
      }

      const { targetProfile, activityPubActor } = await db
        .select({
          targetProfile: {
            id: Profiles.id,
            followAcceptMode: Profiles.followAcceptMode,
          },
          activityPubActor: {
            uri: ProfileActivityPubActors.uri,
          },
        })
        .from(Profiles)
        .leftJoin(ProfileActivityPubActors, eq(Profiles.id, ProfileActivityPubActors.profileId))
        .where(and(eq(Profiles.id, input.profileId), eq(Profiles.state, ProfileState.ACTIVE)))
        .then(firstOrThrowWith(() => new NotFoundError()));

      await db.transaction(async (tx) => {
        const profileFollows = await match(targetProfile.followAcceptMode)
          .with(ProfileFollowAcceptMode.AUTO, () =>
            tx
              .insert(ProfileFollows)
              .values({
                profileId: ctx.session.profileId,
                targetProfileId: targetProfile.id,
              })
              .onConflictDoNothing()
              .returning({ id: ProfileFollows.id }),
          )
          .with(ProfileFollowAcceptMode.MANUAL, () =>
            tx
              .insert(ProfileFollowRequests)
              .values({
                profileId: ctx.session.profileId,
                targetProfileId: targetProfile.id,
              })
              .onConflictDoNothing()
              .returning({ id: ProfileFollowRequests.id }),
          )
          .exhaustive();

        if (profileFollows.length > 0) {
          if (targetProfile.followAcceptMode === ProfileFollowAcceptMode.AUTO) {
            await Promise.all([
              tx
                .update(Profiles)
                .set({
                  followerCount: sql`${Profiles.followerCount} + 1`,
                })
                .where(eq(Profiles.id, targetProfile.id)),
              tx
                .update(Profiles)
                .set({
                  followingCount: sql`${Profiles.followingCount} + 1`,
                })
                .where(eq(Profiles.id, ctx.session.profileId)),
            ]);
          }

          if (activityPubActor) {
            const fedifyContext = getFedifyContext();
            const targetActor = await fedifyContext.lookupObject(activityPubActor.uri);

            if (!isActor(targetActor)) {
              throw new NotFoundError();
            }

            await fedifyContext.sendActivity(
              { identifier: ctx.session.profileId },
              targetActor,
              new Follow({
                actor: fedifyContext.getActorUri(ctx.session.profileId),
                object: targetActor.id,
                to: targetActor.id,
              }),
            );
          }
        }
      });

      return targetProfile.id;
    },
  }),
);
