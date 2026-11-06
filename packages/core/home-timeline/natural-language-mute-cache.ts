import { runRedisCommand } from '../redis/client';
import type { NaturalLanguageMuteDecision } from './decision';

const cacheKeyPrefix = 'kosmo:home-timeline:natural-language-mute:profile:';
const keyLifetimeSeconds = 604_800;

const cacheKey = (profileId: string, postId: string) =>
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
    const result = await runRedisCommand((client) => client.get(cacheKey(profileId, postId)));
    return parseNaturalLanguageMuteDecision(result?.value);
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
    const result = await runRedisCommand((client) =>
      client.set(cacheKey(profileId, postId), JSON.stringify(decision), {
        EX: keyLifetimeSeconds,
        GET: true,
        NX: true,
      }),
    );

    const cachedDecision = parseNaturalLanguageMuteDecision(result?.value);
    if (cachedDecision !== null) {
      return cachedDecision;
    }
  } catch {
    // Redis is disposable; cache failures do not change the decision.
  }

  return decision;
}
