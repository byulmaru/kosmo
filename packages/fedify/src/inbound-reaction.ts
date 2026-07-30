import '@kosmo/core/polyfill';

import { materializeInboundReaction } from '@kosmo/core/services';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import type { InboxContext } from '@fedify/fedify';
import type { EmojiReact, Like } from '@fedify/vocab';

const fallbackReactionType = '❤️';

const toReactionType = (activity: Like | EmojiReact): string => {
  const content = activity.content?.toString();
  const parsed = reactionTypeSchema.safeParse(content);

  return parsed.success ? parsed.data : fallbackReactionType;
};

export const handleInboundReaction = async (
  _context: InboxContext<void>,
  activity: Like | EmojiReact,
): Promise<void> => {
  const activityUri = activity.id;
  const actorUri = uniqueHref(activity.actorIds);
  const objectUri = uniqueHref(activity.objectIds);
  if (!isHttpUri(activityUri) || !actorUri || !objectUri) {
    return;
  }

  await materializeInboundReaction({
    activityUri: activityUri.href,
    actorUri,
    objectUri,
    type: toReactionType(activity),
  });
};
