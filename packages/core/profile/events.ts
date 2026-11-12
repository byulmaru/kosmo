import { createPubSub } from '@graphql-yoga/subscription';
import { runRedisCommand } from '../redis/client';
import { redisEventTarget } from '../redis/pubsub';

type ProfileEvents = {
  profileDisabled: [profileId: string, payload: true];
};

export const profilePubSub = createPubSub<ProfileEvents>({
  eventTarget: redisEventTarget,
});

export const publishProfileDisabled = async (profileId: string): Promise<void> => {
  try {
    const result = await runRedisCommand(
      (client) => client.publish(`profileDisabled:${profileId}`, JSON.stringify({ detail: true })),
      { waitForReady: true },
    );
    if (result === null) {
      console.error('Profile disabled event publish failed', { name: 'RedisUnavailableError' });
    }
  } catch (error) {
    console.error('Profile disabled event publish failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
  }
};
