import { ActivityPubService, TimelineService } from '..';
import { defineService } from '../define';

type DistributeParams = {
  postId: string;
};

export const distribute = defineService(
  'post:distribute',
  async ({ postId }: DistributeParams) => {
    // 타임라인 배포
    await TimelineService.distribute.queue({ postId });

    // ActivityPub 배포
    await ActivityPubService.distribute.queue({ postId });
  },
  {
    defaultQueueOptions: {
      deduplication: {
        id: (input) => `post:distribute:${input.postId}`,
        replace: true,
      },
    },
  },
);
