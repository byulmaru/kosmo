import { Create } from '@fedify/fedify';
import { PostManager } from '@kosmo/manager';
import { defineService } from '../../define';
import { getFedifyContext } from '../federation';

type SendNoteParams = {
  postId: string;
  profileId: string;
  instanceId: string;
  inboxUrl: string;
};

export const sendNote = defineService(
  'activitypub:send:note',
  async ({ postId, profileId, inboxUrl }: SendNoteParams) => {
    // TODO: Circuit breaker

    const note = await PostManager.getActivityPubNote({ postId });
    if (!note) {
      return;
    }

    const ctx = getFedifyContext(note.id!.host);

    ctx.sendActivity(
      { identifier: profileId },
      { id: null, inboxId: new URL(inboxUrl) },
      new Create({
        object: note,
        actors: note.attributionIds,
        tos: note.toIds,
        ccs: note.ccIds,
      }),
    );
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) =>
          `activitypub:send:note:${input.postId}:${input.instanceId}:${input.inboxUrl}`,
        replace: true,
      },
    },
  },
);
