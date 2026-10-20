import { Mention } from '@fedify/vocab';
import { ActivityPubActors, db, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { resolveConfiguredLocalInstance } from '@kosmo/core/local-instance';
import { isConfiguredLocalProfile } from '@kosmo/core/profile';
import { eq, inArray } from 'drizzle-orm';
import { isHttpUri } from './activitypub-uri';
import type { Note } from '@fedify/vocab';

export type InboundMentionCandidate = {
  readonly profileId: string;
  readonly relativeHandle: string;
  readonly targetHref: string;
};

export type StoredInboundMentionCandidates = {
  readonly hasActiveLocalProfile: boolean;
  readonly candidates: InboundMentionCandidate[];
  readonly knownActorHrefs: string[];
};

const noNetworkDocumentLoader = async (): Promise<never> => {
  throw new TypeError('Remote Mention lookup is disabled');
};

export const collectInboundMentionTargetHrefs = async (note: Note): Promise<string[]> => {
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

  return [...targetHrefs];
};

export const resolveStoredInboundMentionCandidates = async (
  targetHrefs: readonly string[],
): Promise<StoredInboundMentionCandidates> => {
  if (targetHrefs.length === 0) {
    return { hasActiveLocalProfile: false, candidates: [], knownActorHrefs: [] };
  }

  const profileRows = await db
    .select({
      domain: Instances.domain,
      handle: Profiles.handle,
      instanceId: Profiles.instanceId,
      instanceCanonicalOrigin: Instances.canonicalOrigin,
      instanceKind: Instances.kind,
      instanceState: Instances.state,
      profileId: ActivityPubActors.profileId,
      actorHref: ActivityPubActors.uri,
      profileState: Profiles.state,
      profileUrl: ActivityPubActors.profileUrl,
    })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(inArray(ActivityPubActors.uri, [...targetHrefs]));

  if (profileRows.length === 0) {
    return { hasActiveLocalProfile: false, candidates: [], knownActorHrefs: [] };
  }

  const configuredLocalInstance = await resolveConfiguredLocalInstance();

  const candidates = profileRows.flatMap((profile) => {
    const relativeHandle = isConfiguredLocalProfile(
      { instanceId: profile.instanceId },
      configuredLocalInstance,
    )
      ? `@${profile.handle}`
      : `@${profile.handle}@${profile.domain}`;
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

    return [...new Set(verifiedHrefs)].map((targetHref) => ({
      profileId: profile.profileId,
      relativeHandle,
      targetHref,
    }));
  });

  return {
    hasActiveLocalProfile: profileRows.some(
      ({ instanceKind, instanceState, profileState }) =>
        instanceKind === InstanceKind.LOCAL &&
        instanceState === InstanceState.ACTIVE &&
        profileState === ProfileState.ACTIVE,
    ),
    candidates,
    knownActorHrefs: profileRows.map(({ actorHref }) => actorHref),
  };
};
