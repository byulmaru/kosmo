import '@kosmo/core/polyfill';

import { Note, PUBLIC_COLLECTION } from '@fedify/vocab';
import { InstanceState, PostVisibility } from '@kosmo/core/enums';
import { findStoredRemoteProfileActorByUri } from './remote-actor-materialization';
import type { InboxContext } from '@fedify/fedify';
import type { Create, LanguageString } from '@fedify/vocab';
import type { PostVisibility as PostVisibilityValue } from '@kosmo/core/enums';

export type InboundCreateNoteMaterializationInput = {
  actorUri: string;
  content: string | null;
  mediaType: string | null;
  objectUri: string;
  published: Temporal.Instant | null;
  receivedAt: Temporal.Instant;
  summary: string | null;
  visibility: PostVisibilityValue;
};

const getNow = () => Temporal.Now.instant();

const uniqueHref = (uris: URL[]): string | undefined => {
  const hrefs = new Set(uris.map((uri) => uri.href));

  return hrefs.size === 1 ? hrefs.values().next().value : undefined;
};

const toPrimitiveString = (value: string | LanguageString | null): string | null =>
  value === null ? null : value.toString();

const resolveVisibility = (note: Note): PostVisibilityValue | undefined => {
  if (note.toIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)) {
    return PostVisibility.PUBLIC;
  }

  if (note.ccIds.some((uri) => uri.href === PUBLIC_COLLECTION.href)) {
    return PostVisibility.UNLISTED;
  }

  return undefined;
};

export const handleInboundCreateNote = async (
  context: InboxContext<void>,
  create: Create,
  receivedAt: Temporal.Instant = getNow(),
): Promise<InboundCreateNoteMaterializationInput | undefined> => {
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

  if (!(object instanceof Note) || object.id?.href !== objectUri) {
    return undefined;
  }

  const attributionUri = uniqueHref(object.attributionIds);
  if (
    attributionUri !== actorUri ||
    object.replyTargetIds.length > 0 ||
    object.replyTargetId !== null
  ) {
    return undefined;
  }

  const visibility = resolveVisibility(object);
  if (!visibility) {
    return undefined;
  }

  return {
    actorUri,
    content: toPrimitiveString(object.content),
    mediaType: object.mediaType,
    objectUri,
    published: object.published,
    receivedAt,
    summary: toPrimitiveString(object.summary),
    visibility,
  };
};
