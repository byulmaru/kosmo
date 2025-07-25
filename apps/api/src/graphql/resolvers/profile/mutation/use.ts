import { db, Sessions } from '@kosmo/shared/db';
import { eq } from 'drizzle-orm';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';
import { assertProfileAccess } from '@/utils/profile';

builder.mutationField('useProfile', (t) =>
  t.withAuth({ session: true }).fieldWithInput({
    type: Profile,
    input: {
      profileId: t.input.string(),
    },

    resolve: async (_, { input }, ctx) => {
      await assertProfileAccess({
        sessionId: ctx.session.id,
        profileId: input.profileId,
      });

      await db
        .update(Sessions)
        .set({ profileId: input.profileId })
        .where(eq(Sessions.id, ctx.session.id));

      return input.profileId;
    },
  }),
);
