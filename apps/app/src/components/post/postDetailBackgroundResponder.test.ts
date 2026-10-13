import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import type { GestureResponderEvent, View } from 'react-native';
import type { createPostDetailBackgroundResponder as CreatePostDetailBackgroundResponder } from './postDetailBackgroundResponder';

const platform = { OS: 'web' };
mock.module('react-native', {
  exports: {
    Platform: platform,
    findNodeHandle: (view: { nativeTag: number } | null) => view?.nativeTag ?? null,
  },
} as unknown as Parameters<typeof mock.module>[1]);

let createPostDetailBackgroundResponder: typeof CreatePostDetailBackgroundResponder;
before(async () => {
  ({ createPostDetailBackgroundResponder } = await import('./postDetailBackgroundResponder'));
});

function touch(x = 50, y = 50, target = 1): GestureResponderEvent {
  return {
    currentTarget: 1,
    target,
    nativeEvent: { target, pageX: x + 100, pageY: y + 200, locationX: x, locationY: y },
  } as unknown as GestureResponderEvent;
}

function setup() {
  let presses = 0;
  const responder = createPostDetailBackgroundResponder(
    () => {
      presses += 1;
    },
    { width: 100, height: 100 },
  );
  return { responder, presses: () => presses };
}

describe('createPostDetailBackgroundResponder', () => {
  it('claims only direct background touches and yields to scrolling', () => {
    platform.OS = 'web';
    const { responder } = setup();
    assert.equal(responder.onStartShouldSetResponder?.(touch()), true);
    assert.equal(responder.onStartShouldSetResponder?.(touch(50, 50, 2)), false);
    assert.equal(responder.onResponderTerminationRequest?.(touch()), true);
  });

  it('opens once after a stationary tap or small finger jitter', () => {
    const { responder, presses } = setup();
    responder.onResponderGrant?.(touch());
    responder.onResponderMove?.(touch(53, 52));
    responder.onResponderRelease?.(touch(53, 52));
    responder.onResponderRelease?.(touch(53, 52));
    assert.equal(presses(), 1);
  });

  it('cancels a horizontal or vertical drag, including a return to the start', () => {
    for (const [x, y] of [
      [80, 50],
      [50, 80],
      [58, 58],
    ]) {
      const { responder, presses } = setup();
      responder.onResponderGrant?.(touch());
      responder.onResponderMove?.(touch(x, y));
      responder.onResponderMove?.(touch());
      responder.onResponderRelease?.(touch());
      assert.equal(presses(), 0);
    }
  });

  it('checks the final position even without a move event', () => {
    const { responder, presses } = setup();
    responder.onResponderGrant?.(touch());
    responder.onResponderRelease?.(touch(80, 50));
    assert.equal(presses(), 0);
  });

  it('cancels when crossing any edge even within the tap movement tolerance', () => {
    for (const [startX, startY, endX, endY] of [
      [1, 50, -1, 50],
      [99, 50, 100, 50],
      [50, 1, 50, -1],
      [50, 99, 50, 100],
    ]) {
      const { responder, presses } = setup();
      responder.onResponderGrant?.(touch(startX, startY));
      responder.onResponderMove?.(touch(endX, endY));
      responder.onResponderRelease?.(touch(startX, startY));
      assert.equal(presses(), 0);
    }
  });

  it('ignores target-relative move coordinates after crossing a child', () => {
    const { responder, presses } = setup();
    responder.onResponderGrant?.(touch());
    const moved = touch(51, 50, 2);
    moved.nativeEvent.locationX = 0;
    moved.nativeEvent.locationY = 0;
    responder.onResponderMove?.(moved);
    responder.onResponderRelease?.(moved);
    assert.equal(presses(), 1);
  });

  it('cancels termination and allows the next tap', () => {
    const { responder, presses } = setup();
    responder.onResponderGrant?.(touch());
    responder.onResponderTerminate?.(touch());
    responder.onResponderRelease?.(touch());
    assert.equal(presses(), 0);
    responder.onResponderGrant?.(touch());
    responder.onResponderRelease?.(touch());
    assert.equal(presses(), 1);
  });

  it('uses the Native host handle when responder negotiation has no currentTarget', () => {
    platform.OS = 'ios';
    const { responder, presses } = setup();
    const nativeTouch = (target: number) =>
      ({
        ...touch(),
        currentTarget: null,
        nativeEvent: { ...touch().nativeEvent, target },
      }) as unknown as GestureResponderEvent;
    assert.equal(responder.onStartShouldSetResponder?.(nativeTouch(10)), false);
    responder.ref({ nativeTag: 10 } as unknown as View);
    assert.equal(responder.onStartShouldSetResponder?.(nativeTouch(10)), true);
    assert.equal(responder.onStartShouldSetResponder?.(nativeTouch(11)), false);
    responder.onResponderGrant?.(nativeTouch(10));
    responder.onResponderRelease?.(nativeTouch(10));
    assert.equal(presses(), 1);
    responder.ref(null);
    assert.equal(responder.onStartShouldSetResponder?.(nativeTouch(10)), false);
    platform.OS = 'web';
  });
});
