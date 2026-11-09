import { runRedisCommand } from '../redis/client';
import type { NaturalLanguageMuteDecision } from './decision';

const cacheKeyPrefix = 'kosmo:home-timeline:natural-language-mute:profile:';
const keyLifetimeSeconds = 604_800;

const hashKey = (profileId: string) => `${cacheKeyPrefix}${profileId}`;
const resultsKey = (profileId: string) => `${hashKey(profileId)}:results`;
const legacyCacheKey = (profileId: string, postId: string) =>
  `${cacheKeyPrefix}${profileId}:post:${postId}`;
const expiryCursor = (expiresAtMs: number) => String(expiresAtMs).padStart(16, '0');
const expiredResultsMax = (now: number) => `(${expiryCursor(now + 1)}:`;

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
        const now = Date.now();
        const cursor = `${expiryCursor(now + keyLifetimeSeconds * 1_000)}:${postId}`;
        const indexKey = resultsKey(profileId);
        await client.zRemRangeByLex(indexKey, '-', expiredResultsMax(now));
        await client.zAdd(indexKey, { score: 0, value: cursor }, { NX: true });
        await client.expire(indexKey, keyLifetimeSeconds);
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

export async function readNaturalLanguageMuteDecisionCandidates(
  profileId: string,
  options: { after?: string; limit: number },
): Promise<Array<{
  cursor: string;
  postId: string;
  decision: NaturalLanguageMuteDecision | null;
}> | null> {
  const result = await runRedisCommand(async (client) => {
    const now = Date.now();
    const indexKey = resultsKey(profileId);
    await client.zRemRangeByLex(indexKey, '-', expiredResultsMax(now));
    const cursors = await client.zRangeByLex(
      indexKey,
      options.after === undefined ? '-' : `(${options.after}`,
      '+',
      { LIMIT: { offset: 0, count: options.limit } },
    );
    if (cursors.length === 0) {
      return [];
    }

    const postIds = cursors.map((cursor) => cursor.slice(17));
    const decisions = await client.hmGet(hashKey(profileId), postIds);
    return cursors.map((cursor, index) => ({
      cursor,
      postId: postIds[index]!,
      decision: parseNaturalLanguageMuteDecision(decisions[index]),
    }));
  });
  return result?.value ?? null;
}
