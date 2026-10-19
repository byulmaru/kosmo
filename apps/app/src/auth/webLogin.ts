import type { MouseEvent as ReactMouseEvent } from 'react';
import type { GestureResponderEvent } from 'react-native';

type WebActivationEvent = GestureResponderEvent | ReactMouseEvent<HTMLAnchorElement>;

export function startWebLogin(): void {
  window.location.assign('/login');
}

export function startWebLoginFromPress(event: WebActivationEvent): void {
  const pointer = event.nativeEvent as unknown as MouseEvent;

  if (
    (typeof pointer.button === 'number' && pointer.button !== 0) ||
    pointer.altKey ||
    pointer.ctrlKey ||
    pointer.metaKey ||
    pointer.shiftKey
  ) {
    return;
  }

  event.preventDefault();
  startWebLogin();
}
