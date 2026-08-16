import { ActivityPubActors, db, Instances, ProfileFollows, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { isHttpUri } from './activitypub-uri';
import type { Context } from '@fedify/fedify';
import type { Activity, Recipient } from '@fedify/vocab';
import type { LocalOutboundContextData } from './local-outbound-federation';

const FollowerProfiles = alias(Profiles, 'outbound_recipient_follower_profile');
const FollowerInstances = alias(Instances, 'outbound_recipient_follower_instance');

type StoredRecipient = {
  readonly inboxUri: string | null;
  readonly sharedInboxUri: string | null;
  readonly uri: string;
};

const parseHttpUri = (value: string): URL | null => {
  try {
    const uri = new URL(value);
    return isHttpUri(uri) ? uri : null;
  } catch {
    return null;
  }
};

const toRecipient = (actor: StoredRecipient): Recipient | null => {
  if (!actor.inboxUri) {
    return null;
  }

  const id = parseHttpUri(actor.uri);
  const inboxId = parseHttpUri(actor.inboxUri);
  if (!id || !inboxId) {
    return null;
  }

  const sharedInbox = actor.sharedInboxUri ? parseHttpUri(actor.sharedInboxUri) : null;
  return {
    endpoints: sharedInbox ? { sharedInbox } : null,
    id,
    inboxId,
  };
};

export const dispatchActivityPubActivity = async ({
  activity,
  actorProfileId,
  context,
  directProfileIds,
  orderingKey,
}: {
  readonly activity: Activity;
  readonly actorProfileId: string;
  readonly context: Context<LocalOutboundContextData>;
  readonly directProfileIds: readonly string[];
  readonly orderingKey?: string;
}): Promise<void> => {
  const directActors =
    directProfileIds.length === 0
      ? []
      : await db
          .select({
            inboxUri: ActivityPubActors.inboxUri,
            sharedInboxUri: ActivityPubActors.sharedInboxUri,
            uri: ActivityPubActors.uri,
          })
          .from(Profiles)
          .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
          .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, Profiles.id))
          .where(
            and(
              inArray(Profiles.id, directProfileIds),
              eq(Profiles.state, ProfileState.ACTIVE),
              eq(Instances.kind, InstanceKind.ACTIVITYPUB),
              eq(Instances.state, InstanceState.ACTIVE),
              isNotNull(ActivityPubActors.inboxUri),
            ),
          );
  const followerActors = await db
    .select({
      inboxUri: ActivityPubActors.inboxUri,
      sharedInboxUri: ActivityPubActors.sharedInboxUri,
      uri: ActivityPubActors.uri,
    })
    .from(ProfileFollows)
    .innerJoin(FollowerProfiles, eq(FollowerProfiles.id, ProfileFollows.followerProfileId))
    .innerJoin(FollowerInstances, eq(FollowerInstances.id, FollowerProfiles.instanceId))
    .innerJoin(ActivityPubActors, eq(ActivityPubActors.profileId, FollowerProfiles.id))
    .where(
      and(
        eq(ProfileFollows.followeeProfileId, actorProfileId),
        eq(FollowerProfiles.state, ProfileState.ACTIVE),
        eq(FollowerInstances.kind, InstanceKind.ACTIVITYPUB),
        eq(FollowerInstances.state, InstanceState.ACTIVE),
        isNotNull(ActivityPubActors.inboxUri),
      ),
    );

  const recipientsByActor = new Map<string, Recipient>();
  for (const actor of [...directActors, ...followerActors]) {
    const recipient = toRecipient(actor);
    if (recipient?.id && !recipientsByActor.has(recipient.id.href)) {
      recipientsByActor.set(recipient.id.href, recipient);
    }
  }
  const recipients = [...recipientsByActor.values()];
  if (recipients.length === 0) {
    return;
  }

  await context.sendActivity({ identifier: actorProfileId }, recipients, activity, {
    ...(orderingKey ? { orderingKey } : {}),
    preferSharedInbox: true,
  });
};
