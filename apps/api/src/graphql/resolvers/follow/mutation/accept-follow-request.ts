import { ProfileService } from '@kosmo/service';
import { ForbiddenError, NotFoundError } from '@/error';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.mutationField('acceptFollowRequest', (t) =>
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
      await ProfileService.followRequestAccept
        .call({
          actorProfileId: input.profileId,
          targetProfileId: ctx.session.profileId,
        })
        .then((success) => {
          if (!success) {
            throw new NotFoundError();
          }
        });

      return input.profileId;
    },
  }),
);
