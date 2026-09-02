import '@kosmo/core/polyfill';

import { Note } from '@fedify/vocab';
import { InstanceState } from '@kosmo/core/enums';
import { uniqueHref } from './activitypub-uri';
import { handleInboundCreateNote } from './inbound-create-note';
import { observeInbound } from './inbound-observability';
import { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Create } from '@fedify/vocab';

export const handleInboundCreate = async (
  context: InboxContext<void>,
  create: Create,
  receivedAt: Temporal.Instant = Temporal.Now.instant(),
): Promise<void> => {
  const actorUri = uniqueHref(create.actorIds);
  const objectUri = uniqueHref(create.objectIds);

  if (!actorUri || !objectUri) {
    observeInbound({
      outcome: 'rejected',
      activityType: 'Create',
      handler: 'create',
      phase: 'validation',
      reasonCode: 'missing_activity_identity',
    });
    return undefined;
  }

  const storedActor = await findStoredRemoteProfileActorByUri(actorUri);
  if (
    !storedActor ||
    (storedActor.instance.state !== InstanceState.ACTIVE &&
      storedActor.instance.state !== InstanceState.UNRESPONSIVE)
  ) {
    observeInbound({
      outcome: 'noop',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      phase: 'actor_lookup',
      reasonCode: 'remote_actor_unavailable',
    });
    return undefined;
  }

  let object;
  try {
    object = await create.getObject({ documentLoader: context.documentLoader });
  } catch {
    observeInbound({
      outcome: 'external_failure',
      activityType: 'Create',
      actorOrigin: actorUri,
      handler: 'create',
      objectOrigin: objectUri,
      phase: 'object_lookup',
      reasonCode: 'create_object_lookup_failed',
    });
    return undefined;
  }

  if (object instanceof Note) {
    await handleInboundCreateNote({
      actorUri,
      context,
      note: object,
      objectUri,
      storedActor,
      receivedAt,
    });
    return;
  }

  observeInbound({
    outcome: 'external_failure',
    activityType: 'Create',
    actorOrigin: actorUri,
    handler: 'create',
    objectOrigin: objectUri,
    phase: 'protocol',
    reasonCode: 'create_object_not_note',
  });
};
