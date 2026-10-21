import '@kosmo/core/polyfill';

import { Like } from '@fedify/vocab';
import { materializeInboundReaction } from '@kosmo/core/services';
import { reactionTypeSchema } from '@kosmo/core/validation';
import { isHttpUri, uniqueHref } from './activitypub-uri';
import { observeInbound } from './inbound-observability';
import {
  findOrMaterializeRemoteProfileActorByUri,
  findStoredRemoteProfileActorByUri,
} from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { EmojiReact } from '@fedify/vocab';

const fallbackReactionType = '❤️';

const toReactionType = (activity: Like | EmojiReact): string => {
  const content = activity.content?.toString();
  const parsed = reactionTypeSchema.safeParse(content);

  return parsed.success ? parsed.data : fallbackReactionType;
};

export const handleInboundReaction = async (
  context: InboxContext<void>,
  activity: Like | EmojiReact,
): Promise<void> => {
  const activityUri = activity.id;
  const actorUrl = uniqueHref(activity.actorIds);
  const objectUrl = uniqueHref(activity.objectIds);
  const actorUri = actorUrl ? new URL(actorUrl) : null;
  const objectUri = objectUrl ? new URL(objectUrl) : null;
  if (!isHttpUri(activityUri) || !isHttpUri(actorUri) || !isHttpUri(objectUri)) {
    observeInbound({
      outcome: 'rejected',
      activityType: activity instanceof Like ? 'Like' : 'EmojiReact',
      handler: 'reaction',
      phase: 'validation',
      reasonCode: 'invalid_reaction_identity',
    });
    return;
  }

  if (!(await findStoredRemoteProfileActorByUri(actorUri))) {
    await findOrMaterializeRemoteProfileActorByUri({
      actorUri,
      contextOrigin: context.canonicalOrigin,
      receipt: { activityUri, receivedAt: Temporal.Now.instant() },
    });
  }

  const result = await materializeInboundReaction({
    activityUri: activityUri.href,
    actorUri: actorUri.href,
    objectUri: objectUri.href,
    onWorkflowStartError: (error) =>
      observeInbound({
        activityType: activity instanceof Like ? 'Like' : 'EmojiReact',
        actorOrigin: actorUri.href,
        error,
        handler: 'reaction',
        objectOrigin: objectUri.href,
        outcome: 'internal_failure',
        phase: 'effect',
        reasonCode: 'reaction_notification_effect_failed',
      }),
    type: toReactionType(activity),
  });
  const activityType = activity instanceof Like ? 'Like' : 'EmojiReact';
  if (result.kind === 'REJECTED') {
    observeInbound({
      outcome: 'rejected',
      activityType,
      actorOrigin: actorUri.href,
      handler: 'reaction',
      objectOrigin: objectUri.href,
      phase: 'projection',
      reasonCode: 'reaction_projection_rejected',
    });
  } else if (result.kind === 'DUPLICATE') {
    observeInbound({
      outcome: 'noop',
      activityType,
      actorOrigin: actorUri.href,
      handler: 'reaction',
      objectOrigin: objectUri.href,
      phase: 'projection',
      reasonCode: 'duplicate_reaction_noop',
    });
  }
};
