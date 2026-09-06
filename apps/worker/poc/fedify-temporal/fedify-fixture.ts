import { createFedifyTemporalFederation } from './federation';
import type { TemporalFedifyQueue } from './queue';

export const createFedifyQueueFixture = (queue: TemporalFedifyQueue) => {
  const federation = createFedifyTemporalFederation(queue, {
    origin: 'https://local.example',
  });
  // The inbox worker asks for a document loader scoped to the recipient.  A
  // fixture has no local actor keys, but registering an empty dispatcher keeps
  // that real Fedify startup path intact without involving application state.
  federation
    .setActorDispatcher('/ap/actor/{identifier}', async () => null)
    .setKeyPairsDispatcher(async () => []);
  return { federation, queue };
};

export type InboxFixtureMessage = Readonly<{
  readonly type: 'inbox';
  readonly id: string;
  readonly baseUrl: string;
  readonly activity: unknown;
  readonly started: string;
  readonly attempt: number;
  readonly identifier: string | null;
  readonly traceContext: Readonly<Record<string, string>>;
}>;

export const createInboxFixtureMessage = (
  activity: unknown,
  overrides: Partial<Omit<InboxFixtureMessage, 'type' | 'activity'>> = {},
): InboxFixtureMessage => ({
  type: 'inbox',
  id: crypto.randomUUID(),
  baseUrl: 'https://local.example',
  activity,
  started: new Date().toISOString(),
  attempt: 1,
  identifier: 'local',
  traceContext: {},
  ...overrides,
});

export const createFollowActivity = (id: string) => ({
  '@context': 'https://www.w3.org/ns/activitystreams',
  type: 'Follow',
  id,
  actor: 'https://remote.example/actor',
  object: 'https://local.example/ap/actor/local',
});
