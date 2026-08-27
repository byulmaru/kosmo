import { z } from 'zod';

const profileIdSchema = z
  .string({ error: 'Profile Follow pair requires non-empty profile IDs' })
  .min(1, 'Profile Follow pair requires non-empty profile IDs');

const expectedRowIdSchema = z
  .string({ error: 'Profile Follow command expectedRowId is required' })
  .min(1, 'Profile Follow command expectedRowId is required');

const actorProfileIdSchema = z
  .string({ error: 'Profile Follow command actorProfileId is invalid' })
  .min(1, 'Profile Follow command actorProfileId is invalid');

export const profileFollowEffectOriginSchema = z.enum(['LOCAL', 'ACTIVITYPUB'], {
  error: 'Profile Follow command origin is invalid',
});

export const profileFollowPairSchema = z
  .object({
    followerProfileId: profileIdSchema,
    followeeProfileId: profileIdSchema,
  })
  .strict();

const followCommandSchema = z
  .object({
    kind: z.literal('FOLLOW'),
    origin: profileFollowEffectOriginSchema,
  })
  .strict();

const approveCommandSchema = z
  .object({
    kind: z.literal('APPROVE'),
    actorProfileId: actorProfileIdSchema,
    expectedRowId: expectedRowIdSchema,
    origin: z.literal('LOCAL', {
      error: 'Profile Follow APPROVE command origin is invalid',
    }),
  })
  .strict();

const acceptCommandSchema = z
  .object({
    kind: z.literal('ACCEPT'),
    expectedRowId: expectedRowIdSchema,
    origin: z.literal('ACTIVITYPUB', {
      error: 'Profile Follow ACCEPT command origin is invalid',
    }),
  })
  .strict();

const terminalCommandSchema = (kind: 'REJECT' | 'CANCEL') =>
  z
    .object({
      kind: z.literal(kind),
      actorProfileId: actorProfileIdSchema.optional(),
      expectedRowId: expectedRowIdSchema,
      origin: profileFollowEffectOriginSchema,
    })
    .strict();

export const profileFollowPairCommandSchema = z
  .discriminatedUnion('kind', [
    followCommandSchema,
    approveCommandSchema,
    acceptCommandSchema,
    terminalCommandSchema('REJECT'),
    terminalCommandSchema('CANCEL'),
  ])
  .superRefine((command, context) => {
    if (
      (command.kind === 'REJECT' || command.kind === 'CANCEL') &&
      command.origin === 'LOCAL' &&
      command.actorProfileId === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['actorProfileId'],
        message: 'Profile Follow command actorProfileId is required',
      });
    }
  });

export const profileFollowRemovalInputSchema = z
  .object({
    followerProfileId: profileIdSchema,
    followeeProfileId: profileIdSchema,
    expectedRowId: expectedRowIdSchema,
    origin: profileFollowEffectOriginSchema,
  })
  .strict();

export type ProfileFollowEffectOrigin = z.infer<typeof profileFollowEffectOriginSchema>;
export type ProfileFollowPairCommand = Readonly<z.infer<typeof profileFollowPairCommandSchema>>;
export type ProfileFollowRemovalInput = Readonly<z.infer<typeof profileFollowRemovalInputSchema>>;
