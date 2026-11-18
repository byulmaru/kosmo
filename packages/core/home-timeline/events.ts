import { createPubSub } from '@graphql-yoga/subscription';
import { redisEventTarget } from '../redis/pubsub';

export type HomeTimelineEvents = {
  homeTimelinePostAdded: [profileId: string, payload: { postId: string }];
};

export const homeTimelinePubSub = createPubSub<HomeTimelineEvents>({
  eventTarget: redisEventTarget,
});

export const publishHomeTimelinePostAdded = ({
  postId,
  profileId,
}: {
  readonly postId: string;
  readonly profileId: string;
}): void => {
  try {
    homeTimelinePubSub.publish('homeTimelinePostAdded', profileId, { postId });
  } catch {
    // Home timeline events are best effort and must not fail a successful cache write.
  }
};
