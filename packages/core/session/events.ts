import { createPubSub } from '@graphql-yoga/subscription';
import { runRedisCommand } from '../redis/client';
import { redisEventTarget } from '../redis/pubsub';

type SessionEvents = {
  sessionEnded: [sessionId: string, payload: true];
};

export const sessionPubSub = createPubSub<SessionEvents>({
  eventTarget: redisEventTarget,
});

export const publishSessionEnded = async (sessionId: string): Promise<void> => {
  try {
    // PubSub.publish cannot await the Redis publisher's first connection.
    const result = await runRedisCommand(
      (client) => client.publish(`sessionEnded:${sessionId}`, JSON.stringify({ detail: true })),
      { waitForReady: true },
    );
    if (result === null) {
      console.error('Session ended event publish failed', { name: 'RedisUnavailableError' });
    }
  } catch (error) {
    console.error('Session ended event publish failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    });
  }
};
