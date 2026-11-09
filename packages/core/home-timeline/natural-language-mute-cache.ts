import { runRedisCommand } from '../redis/client';
import type { NaturalLanguageMuteDecision } from './decision';

const cacheKeyPrefix = 'kosmo:home-timeline:natural-language-mute:profile:';
const keyLifetimeSeconds = 604_800;

const hashKey = (profileId: string) => `${cacheKeyPrefix}${profileId}`;
const legacyCacheKey = (profileId: string, postId: string) =>
  `${cacheKeyPrefix}${profileId}:post:${postId}`;

function parseNaturalLanguageMuteDecision(value: unknown): NaturalLanguageMuteDecision | null {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }

    const { decision, probability } = parsed as Record<string, unknown>;
    if (
      (decision !== 'include' && decision !== 'exclude') ||
      typeof probability !== 'number' ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
      return null;
    }

    return { decision, probability };
  } catch {
    return null;
  }
}

export async function getNaturalLanguageMuteDecision(
  profileId: string,
  postId: string,
): Promise<NaturalLanguageMuteDecision | null> {
  try {
    const result = await runRedisCommand(async (client) => {
      const cachedDecision = parseNaturalLanguageMuteDecision(
        await client.hGet(hashKey(profileId), postId),
      );
      if (cachedDecision !== null) {
        return cachedDecision;
      }

      return parseNaturalLanguageMuteDecision(await client.get(legacyCacheKey(profileId, postId)));
    });
    return result?.value ?? null;
  } catch {
    return null;
  }
}

export async function cacheNaturalLanguageMuteDecision(
  profileId: string,
  postId: string,
  decision: NaturalLanguageMuteDecision,
): Promise<NaturalLanguageMuteDecision> {
  try {
    const result = await runRedisCommand(async (client) => {
      const inserted = await client.hSetEx(
        hashKey(profileId),
        { [postId]: JSON.stringify(decision) },
        { mode: 'FNX', expiration: { type: 'EX', value: keyLifetimeSeconds } },
      );
      if (inserted === 1) {
        return decision;
      }

      return parseNaturalLanguageMuteDecision(await client.hGet(hashKey(profileId), postId));
    });

    if (result?.value !== null && result?.value !== undefined) {
      return result.value;
    }
  } catch {
    // Redis is disposable; cache failures do not change the decision.
  }

  return decision;
}

export async function scanNaturalLanguageMuteDecisions(
  profileId: string,
  cursor: string,
  count: number,
): Promise<{
  cursor: string;
  entries: Array<{ postId: string; decision: NaturalLanguageMuteDecision | null }>;
} | null> {
  const result = await runRedisCommand(async (client) => {
    const page = await client.hScan(hashKey(profileId), cursor, { COUNT: count });
    return {
      cursor: page.cursor,
      entries: page.entries.map(({ field, value }) => ({
        postId: field,
        decision: parseNaturalLanguageMuteDecision(value),
      })),
    };
  });
  return result?.value ?? null;
}
