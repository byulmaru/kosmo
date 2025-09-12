import { Accept, Follow } from '@fedify/fedify';
import { ProfileManager } from '@kosmo/manager';
import { defineService } from '../../../define';
import { getFedifyContext } from '../../federation';
import { parsePersonalRecipient, parseSender } from '../types';
import type { ActivityPersonalRecipient, ActivitySender } from '../types';

type SendAcceptFollowParams = {
  sender: ActivitySender;
  recipient: ActivityPersonalRecipient;
};

export const sendAcceptFollow = defineService(
  'activitypub:send:accept:follow',
  async (params: SendAcceptFollowParams) => {
    const sender = await parseSender(params.sender);
    const recipient = await parsePersonalRecipient(params.recipient);

    // TODO: Circuit breaker

    const ctx = getFedifyContext(sender.webDomain);

    await ctx.sendActivity(
      { identifier: sender.profileId },
      { id: recipient.uri, inboxId: recipient.inboxUrl },
      new Accept({
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
          `activitypub:send:accept:follow:${input.sender.profileId}:${input.recipient.profileId}`,
        replace: true,
      },
    },
  },
);
