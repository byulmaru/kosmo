import {
  AccountProfiles,
  db,
  firstOrThrow,
  firstOrThrowWith,
  Profiles,
  Sessions,
} from '@kosmo/core/db';
import { ProfileState } from '@kosmo/core/enums';
import { NotFoundError } from '@kosmo/core/error';
import { and, eq, getColumns } from 'drizzle-orm';
import { z } from 'zod';
import { builder } from '@/graphql/builder';
import { SelectProfilePayload } from './payload';

builder.mutationField('selectProfile', (t) =>
  t.withAuth({ login: true }).fieldWithInput({
    type: SelectProfilePayload,
    input: {
      id: t.input.id({ validate: z.uuid() }),
    },
    resolve: async (_, { input }, ctx) => {
      const profile = await db
        .select(getColumns(Profiles))
        .from(Profiles)
        .leftJoin(AccountProfiles, and(eq(AccountProfiles.profileId, Profiles.id)))
        .where(
          and(
            eq(Profiles.id, input.id),
            eq(Profiles.state, ProfileState.ACTIVE),
            eq(AccountProfiles.accountId, ctx.session.accountId),
          ),
        )
        .limit(1)
        .then(firstOrThrowWith(() => new NotFoundError('Profile not found')));

      await db
        .update(Sessions)
        .set({ activeProfileId: profile.id })
        .where(eq(Sessions.id, ctx.session.id))
        .returning()
        .then(firstOrThrow);

      return { profile };
    },
  }),
);
