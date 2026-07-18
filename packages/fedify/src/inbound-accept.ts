import { Follow } from '@fedify/vocab';
import { NotFoundError } from '@kosmo/core/error';
import { isHttpUri } from './activitypub-uri';
import { handleInboundAcceptFollow } from './inbound-accept-follow';
import { findUsableStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Accept } from '@fedify/vocab';

export const handleInboundAccept = async (
  context: InboxContext<void>,
  accept: Accept,
): Promise<void> => {
  const actorUri = accept.actorId;
  if (!isHttpUri(actorUri)) {
    return;
  }

  let remoteActor: Awaited<ReturnType<typeof findUsableStoredRemoteProfileActorByUri>>;
  try {
    remoteActor = await findUsableStoredRemoteProfileActorByUri(actorUri);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return;
    }
    throw error;
  }
  if (!remoteActor) {
    return;
  }

  const object = await accept.getObject({
    crossOrigin: 'trust',
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (object instanceof Follow) {
    await handleInboundAcceptFollow({
      context,
      follow: object,
      followeeActorUri: actorUri,
      followeeProfileId: remoteActor.profile.id,
    });
  }
};
