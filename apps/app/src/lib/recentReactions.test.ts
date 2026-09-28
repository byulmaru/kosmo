import assert from 'node:assert/strict';
import { before, beforeEach, mock, test } from 'node:test';
import type * as RecentReactions from './recentReactions';

const values = new Map<string, string>();
mock.module('@react-native-async-storage/async-storage', {
  exports: {
    default: {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    },
  },
} as unknown as Parameters<typeof mock.module>[1]);

let readRecentReactions: typeof RecentReactions.readRecentReactions;
let recordRecentReaction: typeof RecentReactions.recordRecentReaction;

before(async () => {
  ({ readRecentReactions, recordRecentReaction } = await import('./recentReactions'));
});
beforeEach(() => values.clear());

test('최근 반응은 프로필별로 중복 없이 최신 8개만 보관하며 빠른 연속 선택도 순서대로 저장한다', async () => {
  await Promise.all(
    Array.from({ length: 10 }, (_, index) => recordRecentReaction('profile-a', `emoji-${index}`)),
  );
  assert.deepEqual(
    await readRecentReactions('profile-a'),
    Array.from({ length: 8 }, (_, index) => `emoji-${9 - index}`),
  );

  await recordRecentReaction('profile-a', 'emoji-5');
  await recordRecentReaction('profile-b', 'emoji-other');
  assert.deepEqual((await readRecentReactions('profile-a')).slice(0, 3), [
    'emoji-5',
    'emoji-9',
    'emoji-8',
  ]);
  assert.deepEqual(await readRecentReactions('profile-b'), ['emoji-other']);
});

test('손상된 로컬 기록은 빈 최근 목록으로 취급한다', async () => {
  values.set('kosmo:recent-reactions:profile-a', '{');
  assert.deepEqual(await readRecentReactions('profile-a'), []);
});
