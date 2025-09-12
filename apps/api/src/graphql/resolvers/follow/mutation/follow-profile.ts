import { ProfileService } from '@kosmo/service';
import { match } from 'ts-pattern';
import { ForbiddenError, NotFoundError } from '@/error';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

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
      await ProfileService.follow
        .call({
          actorProfileId: ctx.session.profileId,
          targetProfileId: input.profileId,
        })
        .catch((error: unknown) => {
          if (error instanceof Error) {
            throw match(error.message)
              .with('SELF_FOLLOW', () => new ForbiddenError())
              .with('NOT_FOUND', () => new NotFoundError())
              .otherwise(() => error);
          }
          throw error;
        });

      return input.profileId;
    },
  }),
);
