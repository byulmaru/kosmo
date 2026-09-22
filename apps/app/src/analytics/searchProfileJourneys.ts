import { captureSearchProfileAnalytics } from './client';
import type { SearchProfileEventArgs } from './events';

export type SearchProfileJourney = Readonly<{
  id: string;
  targetId: string;
  sessionId: string;
  startedAt: number;
  generation: number;
}>;

type Capture = (
  args: SearchProfileEventArgs,
  expectedSessionId?: string,
  occurredAt?: number,
) => string | null;

/** Tab-local attribution. Target IDs and search keys never leave this module. */
export function createSearchProfileJourneys(capture: Capture) {
  let searchKey: string | null = null;
  let generation = 0;
  let actor: string | null = null;
  let session: string | null = null;
  const selected = new Map<string, SearchProfileJourney>();
  const successes = new Set<string>();
  let navigation: { path: string; journey: SearchProfileJourney } | null = null;

  const end = () => {
    generation += 1;
    navigation = null;
  };
  const isActive = (journey: SearchProfileJourney) =>
    journey.generation === generation && selected.get(journey.targetId) === journey;

  return {
    end,
    setSearch(key: string) {
      if (searchKey === key) {
        return;
      }
      end();
      searchKey = key;
      selected.clear();
      successes.clear();
    },
    setActor(accountId: string | null, profileId: string | null, status: string) {
      const next = JSON.stringify([accountId, profileId, status]);
      if (actor !== null && next !== actor) {
        end();
        selected.clear();
        successes.clear();
      }
      actor = next;
    },
    observeSession(sessionId: string) {
      if (session !== null && sessionId !== session) {
        end();
        selected.clear();
        successes.clear();
      }
      session = sessionId;
    },
    beginNavigation() {
      navigation = null;
    },
    observePath(path: string) {
      if (navigation?.path !== path) {
        navigation = null;
      }
    },
    select(key: string, targetId: string, path: string): SearchProfileJourney | null {
      if (key !== searchKey) {
        return null;
      }
      let journey = selected.get(targetId);
      if (!journey) {
        try {
          const id = globalThis.crypto.randomUUID();
          const startedAt = Date.now();
          const sessionId = capture(
            [
              'search_profile_journey_started',
              { search_profile_journey_id: id, source: 'search_people' },
            ],
            undefined,
            startedAt,
          );
          if (!sessionId) {
            return null;
          }
          // capture can synchronously rotate the SDK session and end old journeys.
          journey = { id, targetId, startedAt, sessionId, generation };
          selected.set(targetId, journey);
        } catch {
          return null;
        }
      }
      navigation = { path, journey };
      return journey;
    },
    forSearch(key: string, targetId: string): SearchProfileJourney | null {
      const journey = key === searchKey ? selected.get(targetId) : null;
      return journey && isActive(journey) ? journey : null;
    },
    forRoute(path: string, targetId: string): SearchProfileJourney | null {
      const journey = navigation?.path === path ? navigation.journey : null;
      return journey?.targetId === targetId && isActive(journey) ? journey : null;
    },
    succeed(journey: SearchProfileJourney | null, targetId: string, kind: 'view' | 'follow') {
      if (!journey || journey.targetId !== targetId || !isActive(journey)) {
        return;
      }
      const occurredAt = Date.now();
      const elapsed = occurredAt - journey.startedAt;
      const successKey = `${journey.id}:${kind}`;
      if (elapsed < 0 || elapsed > 1_800_000 || successes.has(successKey)) {
        return;
      }
      try {
        const capturedSession = capture(
          [
            kind === 'view' ? 'search_profile_view_succeeded' : 'search_profile_follow_succeeded',
            { search_profile_journey_id: journey.id, source: 'search_people', elapsed_ms: elapsed },
          ],
          journey.sessionId,
          occurredAt,
        );
        if (capturedSession === journey.sessionId) {
          successes.add(successKey);
        }
      } catch {
        // Analytics is best-effort; the product action has already succeeded.
      }
    },
  };
}

export const searchProfileJourneys = createSearchProfileJourneys(captureSearchProfileAnalytics);
