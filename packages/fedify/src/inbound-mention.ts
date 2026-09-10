import { Mention } from '@fedify/vocab';
import { ActivityPubActors, db } from '@kosmo/core/db';
import { inArray } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import type { Note } from '@fedify/vocab';

export type InboundMentionCandidate = {
  readonly label: string | null;
  readonly profileId: string;
  readonly targetHref: string;
};

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Mention lookup is disabled');
};

export const collectInboundMentionCandidates = async (
  note: Note,
): Promise<InboundMentionCandidate[]> => {
  const candidates: Array<{ label: string | null; targetHref: string }> = [];

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

  if (candidates.length === 0) {
    return [];
  }

  const profileRows = await db
    .select({
      profileId: ActivityPubActors.profileId,
      targetHref: ActivityPubActors.uri,
    })
    .from(ActivityPubActors)
    .where(
      inArray(ActivityPubActors.uri, [...new Set(candidates.map(({ targetHref }) => targetHref))]),
    );
  const profileIdByTargetHref = new Map(
    profileRows.map(({ profileId, targetHref }) => [targetHref, profileId]),
  );

  return candidates.flatMap((candidate) => {
    const profileId = profileIdByTargetHref.get(candidate.targetHref);
    return profileId === undefined ? [] : [{ ...candidate, profileId }];
  });
};
