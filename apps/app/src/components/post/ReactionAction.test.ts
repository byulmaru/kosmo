import assert from 'node:assert/strict';
import { afterEach, before, mock, test } from 'node:test';
import { createElement } from 'react';
import { act, create } from 'react-test-renderer';
import type { View } from 'react-native';
import type { ReactTestRenderer } from 'react-test-renderer';
import type { PostReactionController } from './PostReactionController';
import type { ReactionAction as ReactionActionComponent } from './ReactionAction';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockModule = (specifier: string, exports: object) =>
  mock.module(specifier, { exports } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-relay', { useRelayEnvironment: () => ({}) });
mockModule('@/components/reaction/reactionEmojiCatalog', { reactionEmojiPickerOptions: [] });
mockModule('@/lib/recentReactions', {
  readRecentReactions: async () => [],
  RECENT_REACTION_LIMIT: 3,
  recordRecentReaction: async () => undefined,
});
mockModule('@/session/SessionProvider', { useSession: () => ({ selectedProfileId: null }) });
mockModule('./FullReactionOverlay', { FullReactionOverlay: () => createElement('Overlay') });

let ReactionAction: typeof ReactionActionComponent;
let renderer: ReactTestRenderer | null = null;

function Trigger(props: Record<string, unknown>) {
  return createElement('Trigger', props);
}

before(async () => {
  ({ ReactionAction } = await import('./ReactionAction'));
});

afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = null;
});

const controller = (disabled: boolean): PostReactionController => ({
  disabled,
  errorTypeIds: [],
  pendingTypeIds: [],
  postId: 'post-id',
  reactionCounts: [],
  relativeHandle: '@kosmo',
  selectedTypeIds: [],
  toggleReaction: () => undefined,
});

async function renderAction(
  actionController: PostReactionController,
  execution: { kind: 'enabled' } | { kind: 'resolution-required'; reason: 'guest' | 'profile' },
  coachmarkRef: { current: View | null },
) {
  await act(async () => {
    renderer = create(
      createElement(ReactionAction, {
        controller: actionController,
        execution,
        renderTrigger: (props) => createElement(Trigger, props),
        triggerRef: coachmarkRef,
      }),
    );
  });
  assert.ok(renderer);
  return renderer.root.findByType(Trigger);
}

test('reaction coachmark target is cleared while the trigger is disabled', async () => {
  const coachmarkRef = { current: null } as { current: View | null };
  const trigger = await renderAction(controller(true), { kind: 'enabled' }, coachmarkRef);
  const node = {} as View;

  trigger.props.ref(node);
  assert.equal(coachmarkRef.current, null);

  await act(async () => {
    renderer?.update(
      createElement(ReactionAction, {
        controller: controller(false),
        execution: { kind: 'resolution-required', reason: 'guest' },
        renderTrigger: (props) => createElement(Trigger, props),
        triggerRef: coachmarkRef,
      }),
    );
  });
  renderer!.root.findByType(Trigger).props.ref(node);
  assert.strictEqual(coachmarkRef.current, node);
});
