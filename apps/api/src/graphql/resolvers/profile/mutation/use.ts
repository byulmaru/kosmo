import { db, Sessions } from '@kosmo/shared/db';
import { eq } from 'drizzle-orm';
import { ForbiddenError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { getPermittedProfileId } from '@/utils/profile';

builder.mutationField('useProfile', (t) =>
  t.withAuth({ session: true }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
    },

    errors: {
      types: [ForbiddenError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const profileId = await getPermittedProfileId({
        ctx,
        actorProfileId: input.profileId,
      });

      await db.update(Sessions).set({ profileId }).where(eq(Sessions.id, ctx.session.id));

      return input.profileId;
    },
  }),
);
