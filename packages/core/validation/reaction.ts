import { z } from 'zod';
import { reactionEmojiValues } from './reaction-emoji-values';

const allowedReactionTypes = new Set<string>(reactionEmojiValues);

export const reactionTypeSchema = z.string().refine((value) => allowedReactionTypes.has(value), {
  error: '허용되지 않은 Reaction Type이에요.',
});
