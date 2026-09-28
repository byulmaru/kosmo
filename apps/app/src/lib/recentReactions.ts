import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_REACTION_LIMIT = 16;
const pendingWrites = new Map<string, Promise<string[]>>();

const storageKey = (profileId: string) => `kosmo:recent-reactions:${profileId}`;

async function readStored(profileId: string): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(storageKey(profileId));
    const values: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(values)
      ? [...new Set(values.filter((value): value is string => typeof value === 'string'))].slice(
          0,
          RECENT_REACTION_LIMIT,
        )
      : [];
  } catch {
    return [];
  }
}

export function readRecentReactions(profileId: string): Promise<string[]> {
  return pendingWrites.get(profileId) ?? readStored(profileId);
}

export function recordRecentReaction(profileId: string, id: string): Promise<string[]> {
  const next = readRecentReactions(profileId).then(async (current) => {
    const values = [id, ...current.filter((value) => value !== id)].slice(0, RECENT_REACTION_LIMIT);
    await AsyncStorage.setItem(storageKey(profileId), JSON.stringify(values)).catch(
      () => undefined,
    );
    return values;
  });
  pendingWrites.set(profileId, next);
  void next.then(() => {
    if (pendingWrites.get(profileId) === next) {
      pendingWrites.delete(profileId);
    }
  });
  return next;
}
