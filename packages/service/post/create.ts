import { db } from '@kosmo/db';
import { PostVisibility } from '@kosmo/enum';
import { PostManager } from '@kosmo/manager';
import { nodes, schema } from '@kosmo/tiptap';
import { generateJSON } from '@tiptap/html';
import { Node } from '@tiptap/pm/model';
import { ActivityPubService, TimelineService } from '..';
import { defineService } from '../define';
import type { JSONContent } from '@tiptap/core';

type CreateParams = {
  profileId: string;
  visibility: PostVisibility;
  replyToPostId?: string;
  isLocal: boolean;
} & ({ htmlContent: string } | { tiptapContent: JSONContent });

export const create = defineService(
  'post:create',
  async ({ profileId, isLocal, visibility, replyToPostId, ...data }: CreateParams) => {
    const post = await db.transaction(async (tx) => {
      // TODO: 답글을 달 수 있는지 체크

      let content: JSONContent;

      if ('htmlContent' in data) {
        content = generateJSON(data.htmlContent, nodes);
      } else {
        Node.fromJSON(schema, data.tiptapContent).check();
        content = data.tiptapContent;
      }

      const post = await PostManager.create({
        tx,
        profileId,
        content,
        visibility,
        replyToPostId,
      });

      return post;
    });

    await TimelineService.distribute.queue({ postId: post.id });

    if (isLocal) {
      await ActivityPubService.distribute.queue({ postId: post.id });
    }

    return post;
  },
);
