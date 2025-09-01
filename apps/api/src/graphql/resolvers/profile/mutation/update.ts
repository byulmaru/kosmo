import { db, firstOrThrow, Profiles } from '@kosmo/db';
import { eq } from 'drizzle-orm';
import { ValidationError } from '@/errors';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.mutationField('updateProfile', (t) =>
  t.withAuth({ scope: 'profile:write', profile: true }).fieldWithInput({
    type: Profile,
    input: {
      displayName: t.input.string(),
      description: t.input.string({ required: false }),
    },

    errors: {
      types: [ValidationError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      return await db
        .update(Profiles)
        .set({
          displayName: input.displayName,
          description: input.description,
        })
        .where(eq(Profiles.id, ctx.session.profileId))
        .returning()
        .then(firstOrThrow);
    },
  }),
);
