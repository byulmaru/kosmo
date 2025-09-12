import { TimelineManager } from '@kosmo/manager';
import { defineService } from '../define';

type InsertParams = {
  postId: string;
  profileId: string;
};

export const insert = defineService(
  'timeline:insert',
  async ({ postId, profileId }: InsertParams) => {
    await TimelineManager.insert({ postId, profileId });
  },
);
