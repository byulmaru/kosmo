import { dayjs } from '@kosmo/dayjs';
import { db, Files, firstOrThrow, Profiles } from '@kosmo/db';
import { FileState } from '@kosmo/enum';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { ValidationError } from '@/error';
import { builder } from '@/graphql/builder';
import { Profile } from '@/graphql/objects';

builder.mutationField('updateProfile', (t) =>
  t.withAuth({ scope: 'profile:write', profile: true }).fieldWithInput({
    type: Profile,
    input: {
      displayName: t.input.string({ required: false }),
      description: t.input.string({ required: false }),
      avatarFileId: t.input.string({ required: false }),
      headerFileId: t.input.string({ required: false }),
    },

    validate: z
      .object({
        input: z.object({
          displayName: z.string().optional(),
          description: z.string().nullish(),
          avatarFileId: z.string().nullish(),
          headerFileId: z.string().nullish(),
        }),
      })
      .refine(
        ({ input }) =>
          input.displayName ||
          input.description !== undefined ||
          input.avatarFileId !== undefined ||
          input.headerFileId !== undefined,
        'error.input.required',
      ),

    errors: {
      types: [ValidationError],
      dataField: { name: 'profile' },
    },

    resolve: async (_, { input }, ctx) => {
      const profile = await db
        .select({
          id: Profiles.id,
          avatarFileId: Profiles.avatarFileId,
          headerFileId: Profiles.headerFileId,
        })
        .from(Profiles)
        .where(eq(Profiles.id, ctx.session.profileId))
        .then(firstOrThrow);

      return await db.transaction(async (tx) => {
        if (input.avatarFileId && input.avatarFileId !== profile.avatarFileId) {
          if (profile.avatarFileId) {
            await tx
              .update(Files)
              .set({
                state: FileState.DELETED,
                expiresAt: dayjs().add(30, 'days'),
              })
              .where(eq(Files.id, profile.avatarFileId));
          }

          await tx
            .update(Files)
            .set({
              state: FileState.PERMANENT,
              expiresAt: null,
              transform: { width: 400, height: 400 },
            })
            .where(
              and(
                eq(Files.id, input.avatarFileId),
                eq(Files.accountId, ctx.session.accountId),
                eq(Files.state, FileState.EPHEMERAL),
              ),
            )
            .returning({ id: Files.id })
            .then((rows) => {
              if (rows.length === 0) {
                throw new ValidationError({
                  path: 'input.avatarFileId',
                  code: 'error.file.notFound',
                });
              }
            });
        }

        if (input.headerFileId && input.headerFileId !== profile.headerFileId) {
          if (profile.headerFileId) {
            await tx
              .update(Files)
              .set({
                state: FileState.DELETED,
                expiresAt: dayjs().add(30, 'days'),
              })
              .where(and(eq(Files.id, profile.headerFileId)));
          }

          await tx
            .update(Files)
            .set({
              state: FileState.PERMANENT,
              expiresAt: null,
              transform: { width: 1500, height: 500 },
            })
            .where(
              and(
                eq(Files.id, input.headerFileId),
                eq(Files.accountId, ctx.session.accountId),
                eq(Files.state, FileState.EPHEMERAL),
              ),
            )
            .returning({ id: Files.id })
            .then((rows) => {
              if (rows.length === 0) {
                throw new ValidationError({
                  path: 'input.headerFileId',
                  code: 'error.file.notFound',
                });
              }
            });
        }

        return await tx
          .update(Profiles)
          .set({
            displayName: input.displayName ?? undefined,
            description: input.description,
            avatarFileId: input.avatarFileId,
            headerFileId: input.headerFileId,
          })
          .where(eq(Profiles.id, profile.id))
          .returning()
          .then(firstOrThrow);
      });
    },
  }),
);
