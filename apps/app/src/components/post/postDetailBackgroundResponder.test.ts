import assert from 'node:assert/strict';
import { before, describe, it, mock } from 'node:test';
import type { View, ViewProps } from 'react-native';
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

type StartResponderEvent = Parameters<NonNullable<ViewProps['onStartShouldSetResponder']>>[0];
type TerminationRequestEvent = Parameters<
  NonNullable<ViewProps['onResponderTerminationRequest']>
>[0];
type ReleaseEvent = Parameters<NonNullable<ViewProps['onResponderRelease']>>[0];

describe('createPostDetailBackgroundResponder', () => {
  it('claims only direct background touches, yields to scrolling, and opens on release', () => {
    platform.OS = 'web';
    const onPress = () => {
      presses += 1;
    };
    let presses = 0;
    const responder = createPostDetailBackgroundResponder(onPress);
    const surface = 1;
    const child = 2;
    const directTouch = {
      currentTarget: surface,
      target: surface,
    } as unknown as StartResponderEvent;
    const childTouch = {
      currentTarget: surface,
      target: child,
    } as unknown as StartResponderEvent;

    assert.equal(responder.onStartShouldSetResponder?.(directTouch), true);
    assert.equal(responder.onStartShouldSetResponder?.(childTouch), false);
    assert.equal(presses, 0);
    assert.equal(responder.onResponderTerminationRequest?.({} as TerminationRequestEvent), true);

    responder.onResponderRelease?.({} as ReleaseEvent);
    assert.equal(presses, 1);
  });

  it('uses the Native host handle when responder negotiation has no currentTarget', () => {
    platform.OS = 'ios';
    const responder = createPostDetailBackgroundResponder(() => undefined);
    const touch = (target: number) =>
      ({ currentTarget: null, nativeEvent: { target } }) as unknown as StartResponderEvent;

    assert.equal(responder.onStartShouldSetResponder?.(touch(10)), false);
    responder.ref({ nativeTag: 10 } as unknown as View);
    assert.equal(responder.onStartShouldSetResponder?.(touch(10)), true);
    assert.equal(responder.onStartShouldSetResponder?.(touch(11)), false);
    responder.ref(null);
    assert.equal(responder.onStartShouldSetResponder?.(touch(10)), false);
  });
});
