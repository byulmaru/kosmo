import { Mention } from '@fedify/vocab';
import { ActivityPubActors, db, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState } from '@kosmo/core/enums';
import { eq, inArray } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import type { Note } from '@fedify/vocab';

export type InboundMentionCandidate = {
  readonly name: string | null;
  readonly profileId: string;
  readonly targetHref: string;
};

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Mention lookup is disabled');
};

export const collectInboundMentionCandidates = async (
  note: Note,
): Promise<InboundMentionCandidate[]> => {
  const namesByTargetHref = new Map<string, Set<string | null>>();

  for await (const tag of note.getTags({
    contextLoader: noNetworkDocumentLoader,
    crossOrigin: 'trust',
    documentLoader: noNetworkDocumentLoader,
    suppressError: true,
  })) {
    if (!(tag instanceof Mention) || !isHttpUri(tag.href)) {
      continue;
    }

    const names = namesByTargetHref.get(tag.href.href) ?? new Set<string | null>();
    names.add(tag.name?.toString() ?? null);
    namesByTargetHref.set(tag.href.href, names);
  }

  if (namesByTargetHref.size === 0) {
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
      profileUrl: ActivityPubActors.profileUrl,
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(inArray(ActivityPubActors.uri, [...namesByTargetHref.keys()]));

  return profileRows.flatMap((profile) => {
    const verifiedHrefs = [profile.actorHref];
    if (profile.profileUrl !== null) {
      try {
        const profileUrl = new URL(profile.profileUrl);
        if (isHttpUri(profileUrl) && profileUrl.hostname) {
          verifiedHrefs.push(profileUrl.href);
        }
      } catch {
        // A malformed stored URL cannot be used as a trusted profile URL.
      }
    }
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

    const names = namesByTargetHref.get(profile.actorHref) ?? new Set([null]);
    return [...new Set(verifiedHrefs)].flatMap((verifiedHref) =>
      [...names].map((name) => ({
        name,
        profileId: profile.profileId,
        targetHref: verifiedHref,
      })),
    );
  });
};
