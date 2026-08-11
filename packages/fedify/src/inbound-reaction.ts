import '@kosmo/core/polyfill';

import { Like } from '@fedify/vocab';
import { materializeInboundReaction } from '@kosmo/core/services';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { getFedifyDatabase } from './fedify-context';
import {
  observeInbound,
  observeInboundNoop,
  observeInboundRejected,
} from './inbound-observability';
import type { InboxContext } from '@fedify/fedify';
import type { EmojiReact } from '@fedify/vocab';
import type { FedifyContextData } from './fedify-context';

const fallbackReactionType = '❤️';

const toReactionType = (activity: Like | EmojiReact): string => {
  const content = activity.content?.toString();
  const parsed = reactionTypeSchema.safeParse(content);

  return parsed.success ? parsed.data : fallbackReactionType;
};

export const handleInboundReaction = async (
  context: InboxContext<FedifyContextData>,
  activity: Like | EmojiReact,
): Promise<void> => {
  const database = getFedifyDatabase(context.data);
  const activityUri = activity.id;
  const actorUri = uniqueHref(activity.actorIds);
  const objectUri = uniqueHref(activity.objectIds);
  if (!isHttpUri(activityUri) || !actorUri || !objectUri) {
    observeInboundRejected({
      activityType: activity instanceof Like ? 'Like' : 'EmojiReact',
      handler: 'reaction',
      phase: 'validation',
      reasonCode: 'invalid_reaction_identity',
    });
    return;
  }

  const result = await materializeInboundReaction(
    {
      activityUri: activityUri.href,
      actorUri,
      objectUri,
      onPostCommitError: (error) =>
        observeInbound({
          activityType: activity instanceof Like ? 'Like' : 'EmojiReact',
          actorOrigin: actorUri,
          error,
          handler: 'reaction',
          objectOrigin: objectUri,
          outcome: 'internal_failure',
          phase: 'effect',
          reasonCode: 'reaction_notification_effect_failed',
        }),
      type: toReactionType(activity),
    },
    database,
  );
  const activityType = activity instanceof Like ? 'Like' : 'EmojiReact';
  if (result.kind === 'REJECTED') {
    observeInboundRejected({
      activityType,
      actorOrigin: actorUri,
      handler: 'reaction',
      objectOrigin: objectUri,
      phase: 'projection',
      reasonCode: 'reaction_projection_rejected',
    });
  } else if (result.kind === 'DUPLICATE') {
    observeInboundNoop({
      activityType,
      actorOrigin: actorUri,
      handler: 'reaction',
      objectOrigin: objectUri,
      phase: 'projection',
      reasonCode: 'duplicate_reaction_noop',
    });
  }
};
