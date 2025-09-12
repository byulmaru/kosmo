import { Create } from '@fedify/fedify';
import { PostManager } from '@kosmo/manager';
import { defineService } from '../../define';
import { getFedifyContext } from '../federation';

type SendNoteParams = {
  postId: string;
  inboxUrl: string;
  sharedInboxUrl: string | null;
  uri: string;
};

export const sendNote = defineService(
  'activitypub:send:note',
  async ({ postId, inboxUrl, sharedInboxUrl, uri }: SendNoteParams) => {
    // TODO: Circuit breaker

    const { note, profileId } = await PostManager.getActivityPubNote({ postId });
    if (!note) {
      return;
    }

    const ctx = getFedifyContext(note.id!.origin);
    await ctx.sendActivity(
      { identifier: profileId },
      {
        id: new URL(uri),
        inboxId: new URL(inboxUrl),
        endpoints: {
          sharedInbox: sharedInboxUrl ? new URL(sharedInboxUrl) : null,
        },
      },
      new Create({
        object: note,
        actors: note.attributionIds,
        tos: note.toIds,
        ccs: note.ccIds,
      }),
      { preferSharedInbox: true },
    );
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) =>
          `activitypub:send:note:${input.postId}:${input.sharedInboxUrl ?? input.inboxUrl}`,
        replace: true,
      },
    },
  },
);
