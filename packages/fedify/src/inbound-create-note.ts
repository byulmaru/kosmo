import '@kosmo/core/polyfill';

import { PUBLIC_COLLECTION } from '@fedify/vocab';
import { PostVisibility } from '@kosmo/core/enums';
import type { LanguageString, Note } from '@fedify/vocab';
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

export const handleInboundCreateNote = ({
  actorUri,
  note,
  objectUri,
  receivedAt,
}: {
  actorUri: string;
  note: Note;
  objectUri: string;
  receivedAt: Temporal.Instant;
}): InboundCreateNoteMaterializationInput | undefined => {
  if (note.id?.href !== objectUri) {
    return undefined;
  }

  const attributionUri = uniqueHref(note.attributionIds);
  if (
    attributionUri !== actorUri ||
    note.replyTargetIds.length > 0 ||
    note.replyTargetId !== null
  ) {
    return undefined;
  }

  const visibility = resolveVisibility(note);
  if (!visibility) {
    return undefined;
  }

  return {
    actorUri,
    content: toPrimitiveString(note.content),
    mediaType: note.mediaType,
    objectUri,
    published: note.published,
    receivedAt,
    summary: toPrimitiveString(note.summary),
    visibility,
  };
};
