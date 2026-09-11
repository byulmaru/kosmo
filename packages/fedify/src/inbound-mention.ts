import { Mention } from '@fedify/vocab';
import { ActivityPubActors, db, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState } from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import type { Note } from '@fedify/vocab';

export type InboundMentionCandidate = {
  readonly profileId: string;
  readonly targetHref: string;
};

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Mention lookup is disabled');
};

export const collectInboundMentionCandidates = async (
  note: Note,
): Promise<InboundMentionCandidate[]> => {
  const targetHrefs = new Set<string>();

  for await (const tag of note.getTags({
    contextLoader: noNetworkDocumentLoader,
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  })) {
    if (!(tag instanceof Mention) || !isHttpUri(tag.href)) {
      continue;
    }

    targetHrefs.add(tag.href.href);
  }

  if (targetHrefs.size === 0) {
    return [];
  }

  const profileRows = await db
    .select({
      handle: Profiles.handle,
      instanceCanonicalOrigin: Instances.canonicalOrigin,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      profileId: ActivityPubActors.profileId,
      actorHref: ActivityPubActors.uri,
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(inArray(ActivityPubActors.uri, [...targetHrefs]));

  return profileRows.flatMap((profile) => {
    const verifiedHrefs = [profile.actorHref];
    if (
      profile.instanceKind === InstanceKind.LOCAL &&
      profile.instanceState === InstanceState.ACTIVE &&
      profile.instanceCanonicalOrigin !== null
    ) {
      try {
        const humanProfileHref = new URL(
          `/@${encodeURIComponent(profile.handle)}`,
          profile.instanceCanonicalOrigin,
        );
        if (isHttpUri(humanProfileHref)) {
          verifiedHrefs.push(humanProfileHref.href);
        }
      } catch {
        // A malformed stored origin cannot be used as a trusted human URL.
      }
    }

    return [...new Set(verifiedHrefs)].map((verifiedHref) => ({
      profileId: profile.profileId,
      targetHref: verifiedHref,
    }));
  });
};
