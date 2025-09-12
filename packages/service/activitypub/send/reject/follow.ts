import { Follow, Reject } from '@fedify/fedify';
import { ProfileManager } from '@kosmo/manager';
import { defineService } from '../../../define';
import { getFedifyContext } from '../../federation';
import { parsePersonalRecipient, parseSender } from '../types';
import type { ActivityPersonalRecipient, ActivitySender } from '../types';

type SendRejectFollowParams = {
  sender: ActivitySender;
  recipient: ActivityPersonalRecipient;
};

export const sendRejectFollow = defineService(
  'activitypub:send:reject:follow',
  async (params: SendRejectFollowParams) => {
    const sender = await parseSender(params.sender);
    const recipient = await parsePersonalRecipient(params.recipient);

    // TODO: Circuit breaker

    const ctx = getFedifyContext(sender.webDomain);

    await ctx.sendActivity(
      { identifier: sender.profileId },
      { id: recipient.uri, inboxId: recipient.inboxUrl },
      new Reject({
        actor: ProfileManager.getUri(sender.profileId, sender.webDomain),
        object: new Follow({
          actor: recipient.uri,
          object: ProfileManager.getUri(sender.profileId, sender.webDomain),
          to: ProfileManager.getUri(sender.profileId, sender.webDomain),
        }),
        to: recipient.uri,
      }),
    );
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) =>
          `activitypub:send:reject:follow:${input.sender.profileId}:${input.recipient.profileId}`,
        replace: true,
      },
    },
  },
);
