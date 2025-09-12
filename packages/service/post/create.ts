import { db } from '@kosmo/db';
import { PostVisibility } from '@kosmo/enum';
import { PostManager } from '@kosmo/manager';
import { ActivityPubService, TimelineService } from '..';
import { defineService } from '../define';

type CreateParams = {
  profileId: string;
  data: {
    content: string;
    visibility?: PostVisibility;
    replyToPostId?: string;
  };
  isLocal: boolean;
};

export const create = defineService(
  'post:create',
  async ({ profileId, data, isLocal }: CreateParams) => {
    const post = await db.transaction(async (tx) => {
      // TODO: 답글을 달 수 있는지 체크

      const post = await PostManager.create({
        tx,
        profileId,
        data: {
          ...data,
          // TODO: 기본 공개 설정 체크
          visibility: data.visibility ?? PostVisibility.PUBLIC,
        },
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
