import { Follow } from '@fedify/fedify';
import { ProfileManager } from '@kosmo/manager';
import { defineService } from '../../define';
import { getFedifyContext } from '../federation';
import { parsePersonalRecipient, parseSender } from './types';
import type { ActivityPersonalRecipient, ActivitySender } from './types';

type SendFollowParams = {
  sender: ActivitySender;
  recipient: ActivityPersonalRecipient;
};

export const sendFollow = defineService(
  'activitypub:send:follow',
  async (params: SendFollowParams) => {
    const sender = await parseSender(params.sender);
    const recipient = await parsePersonalRecipient(params.recipient);

    // TODO: Circuit breaker

    const ctx = getFedifyContext(sender.webDomain);

    console.log('recipient', recipient);
    console.log('uri type', typeof recipient.uri);

    await ctx.sendActivity(
      { identifier: sender.profileId },
      { id: recipient.uri, inboxId: recipient.inboxUrl },
      new Follow({
        actor: ProfileManager.getUri(sender.profileId, sender.webDomain),
        object: recipient.uri,
        to: recipient.uri,
      }),
    );
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) => `activitypub:follow:${input.sender.profileId}:${input.recipient.profileId}`,
        replace: true,
      },
    },
  },
);
