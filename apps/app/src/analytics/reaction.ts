import { reactionTypeSchema } from '@kosmo/core/validation';

export function getReactionEmojiAnalyticsKey(type: string): string | null {
  if (!reactionTypeSchema.safeParse(type).success) {
    return null;
  }

  const codePoints = Array.from(type, (character) => character.codePointAt(0)!.toString(16));
  return ['unicode', codePoints.join('-')].join(':');
}
