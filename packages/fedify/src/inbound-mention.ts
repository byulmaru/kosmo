import { Mention } from '@fedify/vocab';
import { isHttpUri } from './activitypub-uri';
import type { Note } from '@fedify/vocab';

export type InboundMentionCandidate = {
  readonly label: string | null;
  readonly targetHref: string;
};

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Mention lookup is disabled');
};

export const collectInboundMentionCandidates = async (
  note: Note,
): Promise<InboundMentionCandidate[]> => {
  const candidates: InboundMentionCandidate[] = [];

  for await (const tag of note.getTags({
    contextLoader: noNetworkDocumentLoader,
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  })) {
    if (!(tag instanceof Mention) || !isHttpUri(tag.href)) {
      continue;
    }

    candidates.push({
      label: tag.name?.toString() ?? null,
      targetHref: tag.href.href,
    });
  }

  return candidates;
};
