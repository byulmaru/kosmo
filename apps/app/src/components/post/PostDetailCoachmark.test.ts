import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { afterEach, before, mock, test } from 'node:test';
import { createElement, useEffect } from 'react';
import { act, create } from 'react-test-renderer';
import { createPostDetailCoachmarkSteps } from './PostDetailCoachmarkSteps';
import type { RefObject } from 'react';
import type { View } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostDetailCoachmark as PostDetailCoachmarkComponent } from './PostDetailCoachmark';
import type { PostDetailCoachmarkTargets } from './PostDetailCoachmarkSteps';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const autoStartAccounts: string[] = [];
const manualOpenAccounts: string[] = [];
let autoStartCancellations = 0;
let manualCancellations = 0;
let renderer: ReactTestRenderer | null = null;
let PostDetailCoachmark: typeof PostDetailCoachmarkComponent;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);
const require = createRequire(import.meta.url);

mockModule('expo-router', {
  useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
});
mockModule('lucide-react-native', {
  CircleHelp: () => createElement('CircleHelp'),
});
mockModule(require.resolve('lucide-react-native'), {
  CircleHelp: () => createElement('CircleHelp'),
});
mockModule('react-native', {});
mockModule('@/components/ui/IconButton', {
  IconButton: ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
    createElement('IconButton', props, children as never),
});
mockModule('@/theme/ThemeProvider', {
  useTheme: () => ({ foregroundPrimary: '#000000' }),
});
mockModule('@/components/coachmark/CoachmarkController', {
  useCoachmarkController: ({
    account,
    ready,
  }: {
    account?: { id?: string } | null;
    ready: boolean;
  }) => {
    const accountId = account?.id ?? 'anonymous';
    return {
      open: () => {
        manualOpenAccounts.push(accountId);
        return { cancel: () => (manualCancellations += 1) };
      },
      requestAutoStart: () => {
        if (!ready) {
          return null;
        }
        autoStartAccounts.push(accountId);
        return { cancel: () => (autoStartCancellations += 1) };
      },
    };
  },
});

before(async () => {
  ({ PostDetailCoachmark } = await import('./PostDetailCoachmark'));
});

afterEach(async () => {
  if (renderer) {
    await act(async () => renderer?.unmount());
    renderer = null;
  }
  autoStartAccounts.length = 0;
  manualOpenAccounts.length = 0;
  autoStartCancellations = 0;
  manualCancellations = 0;
});

function targets({ reactionSummary = true } = {}): PostDetailCoachmarkTargets {
  const ref = () => ({ current: {} }) as unknown as RefObject<View | null>;
  return {
    bookmark: ref(),
    reaction: ref(),
    reactionSummary: reactionSummary ? ref() : { current: null },
    repost: ref(),
    reply: ref(),
  };
}

function CoachmarkProbe({
  ready = true,
  summaryAvailable = true,
  version,
}: {
  ready?: boolean;
  summaryAvailable?: boolean;
  version: number;
}) {
  return createElement(PostDetailCoachmark, {
    account: { id: `account-${version}` } as never,
    ready,
    summaryAvailable,
    targets: targets(),
  });
}

test('post detail guide keeps the five action targets in the approved order', () => {
  const input = targets();
  const result = createPostDetailCoachmarkSteps(input);

  assert.equal(result.length, 5);
  assert.deepEqual(
    result.map(({ title }) => title),
    [
      '이모지로 마음을 표현해요',
      '같은 마음이라면 이모지를 눌러요',
      '함께 보고 싶은 글을 공유해요',
      '다시 보고 싶은 글을 저장해요',
      '답글로 대화를 이어가요',
    ],
  );
  assert.strictEqual(result[0]?.anchorRef, input.reaction);
});

test('post detail guide omits the reaction summary when no reaction is attached', () => {
  const result = createPostDetailCoachmarkSteps(targets({ reactionSummary: false }));

  assert.equal(result.length, 4);
  assert.deepEqual(
    result.map(({ title }) => title),
    [
      '이모지로 마음을 표현해요',
      '함께 보고 싶은 글을 공유해요',
      '다시 보고 싶은 글을 저장해요',
      '답글로 대화를 이어가요',
    ],
  );
});

test('post detail guide does not create a step for an unavailable target', () => {
  const unavailable = targets();
  assert.ok(unavailable.bookmark);
  unavailable.bookmark.current = null;

  const result = createPostDetailCoachmarkSteps(unavailable);

  assert.equal(result.length, 4);
  assert.ok(result.every(({ anchorRef }) => anchorRef !== unavailable.bookmark));
});

test('keeps focus lifecycle stable across account metadata rerenders and uses the current manual controller', async () => {
  await act(async () => {
    renderer = create(createElement(CoachmarkProbe, { version: 0 }));
  });

  assert.deepEqual(autoStartAccounts, ['account-0']);
  assert.equal(autoStartCancellations, 0);

  await act(async () => {
    renderer?.update(createElement(CoachmarkProbe, { version: 1 }));
  });

  assert.deepEqual(autoStartAccounts, ['account-0']);
  assert.equal(autoStartCancellations, 0);

  const trigger = renderer?.root.findByType('IconButton' as never);
  await act(async () => trigger?.props.onPress());
  assert.deepEqual(manualOpenAccounts, ['account-1']);

  await act(async () => renderer?.unmount());
  renderer = null;
  assert.equal(autoStartCancellations, 1);
  assert.equal(manualCancellations, 1);
});

test('starts automatically after the current detail targets become ready', async () => {
  await act(async () => {
    renderer = create(createElement(CoachmarkProbe, { ready: false, version: 0 }));
  });
  assert.deepEqual(autoStartAccounts, []);

  await act(async () => {
    renderer?.update(createElement(CoachmarkProbe, { ready: true, version: 0 }));
  });
  assert.deepEqual(autoStartAccounts, ['account-0']);
});

test('cancels the active guide when the reaction summary becomes unavailable', async () => {
  await act(async () => {
    renderer = create(createElement(CoachmarkProbe, { summaryAvailable: true, version: 0 }));
  });

  assert.deepEqual(autoStartAccounts, ['account-0']);
  assert.equal(autoStartCancellations, 0);

  await act(async () => {
    renderer?.update(createElement(CoachmarkProbe, { summaryAvailable: false, version: 0 }));
  });

  assert.equal(autoStartCancellations, 1);
});
