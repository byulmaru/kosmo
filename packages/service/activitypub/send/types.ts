import { db, firstOrThrowWith, Instances, Profiles } from '@kosmo/db';
import { UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';

export type ActivitySender = { profileId: string; webDomain?: string };
export type ActivitySharedRecipient = { instanceId: string; inboxUrl: URL };
export type ActivityPersonalRecipient =
  | {
      profileId: string;
    }
  | { profileId: string; instanceId: string; inboxUrl: string; uri: string };

export const parseSender = async (sender: ActivitySender) => {
  let webDomain = sender.webDomain;
  if (!webDomain) {
    webDomain = (await db
      .select({
        webDomain: Instances.webDomain,
      })
      .from(Profiles)
      .innerJoin(Instances, eq(Profiles.instanceId, Instances.id))
      .where(eq(Profiles.id, sender.profileId))
      .then((rows) => {
        if (rows[0]?.webDomain) {
          return rows[0].webDomain;
        } else {
          throw new UnrecoverableError('SENDER_NOT_FOUND');
        }
      })) as string;
  }

  return { profileId: sender.profileId, webDomain };
};

export const parsePersonalRecipient = async (recipient: ActivityPersonalRecipient) => {
  if ('inboxUrl' in recipient) {
    return {
      profileId: recipient.profileId,
      instanceId: recipient.instanceId,
      inboxUrl: new URL(recipient.inboxUrl),
      uri: new URL(recipient.uri),
    };
  }

  const profile = await db
    .select({
      uri: Profiles.uri,
      inboxUrl: Profiles.inboxUrl,
      instanceId: Profiles.instanceId,
    })
    .from(Profiles)
    .where(eq(Profiles.id, recipient.profileId))
    .then(firstOrThrowWith(() => new UnrecoverableError('RECIPIENT_NOT_FOUND')));

  if (!profile.inboxUrl || !profile.uri) {
    throw new UnrecoverableError('RECIPIENT_NOT_FOUND');
  }

  return {
    profileId: recipient.profileId,
    instanceId: profile.instanceId,
    inboxUrl: new URL(profile.inboxUrl),
    uri: new URL(profile.uri),
  };
};
