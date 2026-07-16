import '@kosmo/core/polyfill';

import { Note } from '@fedify/vocab';
import { InstanceState } from '@kosmo/core/enums';
import { handleInboundCreateNote } from './inbound-create-note';
import { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import { uniqueHref } from './unique-href';
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
    return undefined;
  }

  const storedActor = await findStoredRemoteProfileActorByUri(actorUri);
  if (
    !storedActor ||
    (storedActor.instance.state !== InstanceState.ACTIVE &&
      storedActor.instance.state !== InstanceState.UNRESPONSIVE)
  ) {
    return undefined;
  }

  let object;
  try {
    object = await create.getObject({ documentLoader: context.documentLoader });
  } catch {
    return undefined;
  }

  if (object instanceof Note) {
    await handleInboundCreateNote({
      actorUri,
      note: object,
      objectUri,
      profileId: storedActor.profile.id,
      receivedAt,
    });
  }
};
