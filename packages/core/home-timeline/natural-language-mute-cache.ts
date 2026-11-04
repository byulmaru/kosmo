import { runRedisCommand } from '../redis/client';
import type { NaturalLanguageMuteDecision } from './decision';

const cacheKeyPrefix = 'kosmo:home-timeline:natural-language-mute:profile:';
const keyLifetimeSeconds = 604_800;

const cacheKey = (profileId: string, postId: string) =>
  `${cacheKeyPrefix}${profileId}:post:${postId}`;

export async function getNaturalLanguageMuteDecision(
  profileId: string,
  postId: string,
): Promise<NaturalLanguageMuteDecision | null> {
  try {
    const result = await runRedisCommand((client) => client.get(cacheKey(profileId, postId)));
    const value = result?.value;
    return value === 'include' || value === 'exclude' ? value : null;
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
      client.set(cacheKey(profileId, postId), decision, {
        EX: keyLifetimeSeconds,
        GET: true,
        NX: true,
      }),
    );

    const cachedDecision = result?.value;
    if (cachedDecision === 'include' || cachedDecision === 'exclude') {
      return cachedDecision;
    }
  } catch {
    // Redis is disposable; cache failures do not change the decision.
  }

  return decision;
}
