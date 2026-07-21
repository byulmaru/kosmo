import { ActivityPubActors, db, first, Instances, Profiles } from '@kosmo/core/db';
import { InstanceKind, InstanceState, ProfileState } from '@kosmo/core/enums';
import { and, eq } from 'drizzle-orm';
import type { InboxContext } from '@fedify/fedify';

export const resolveInboundLocalRecipient = async (
  context: InboxContext<void>,
  actorUri: URL,
): Promise<typeof Profiles.$inferSelect | undefined> => {
  if (context.recipient !== null && context.getActorUri(context.recipient).href !== actorUri.href) {
    return undefined;
  }

  const profile = await db
    .select({ profile: Profiles })
    .from(ActivityPubActors)
    .innerJoin(Profiles, eq(Profiles.id, ActivityPubActors.profileId))
    .innerJoin(Instances, eq(Instances.id, Profiles.instanceId))
    .where(
      and(
        eq(ActivityPubActors.uri, actorUri.href),
        eq(Instances.kind, InstanceKind.LOCAL),
        eq(Instances.state, InstanceState.ACTIVE),
        eq(Profiles.state, ProfileState.ACTIVE),
      ),
    )
    .limit(1)
    .then(first)
    .then((row) => row?.profile);

  return context.recipient === null || profile?.id === context.recipient ? profile : undefined;
};
