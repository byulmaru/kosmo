import '@kosmo/core/polyfill';

import { Follow } from '@fedify/vocab';
import { NotFoundError } from '@kosmo/core/error';
import { isHttpUri } from './activitypub-uri';
import { handleInboundRejectFollow } from './inbound-reject-follow';
import { findUsableStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Reject } from '@fedify/vocab';

export const handleInboundReject = async (
  context: InboxContext<void>,
  reject: Reject,
): Promise<void> => {
  const actorUri = reject.actorId;
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

  const object = await reject.getObject({
    documentLoader: context.documentLoader,
    suppressError: true,
  });
  if (object instanceof Follow) {
    await handleInboundRejectFollow({
      context,
      follow: object,
      followeeActorUri: actorUri,
      followeeProfileId: remoteActor.profile.id,
    });
  }
};
