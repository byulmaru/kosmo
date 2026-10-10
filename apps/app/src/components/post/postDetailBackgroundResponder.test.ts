import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPostDetailBackgroundResponder } from './postDetailBackgroundResponder';
import type { ViewProps } from 'react-native';

type StartResponderEvent = Parameters<NonNullable<ViewProps['onStartShouldSetResponder']>>[0];
type TerminationRequestEvent = Parameters<
  NonNullable<ViewProps['onResponderTerminationRequest']>
>[0];
type ReleaseEvent = Parameters<NonNullable<ViewProps['onResponderRelease']>>[0];

describe('createPostDetailBackgroundResponder', () => {
  it('claims only direct background touches, yields to scrolling, and opens on release', () => {
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
});
