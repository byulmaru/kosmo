import { z } from 'zod';

export const reactionTypes = ['🥹', '❤️', '🎉', '👀', '☘️', '🌈'] as const;

export const reactionTypeSchema = z.enum(reactionTypes, {
  error: '허용되지 않은 Reaction Type이에요.',
});

export type ReactionType = z.infer<typeof reactionTypeSchema>;
