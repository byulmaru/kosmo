import { buildWebLoginHref } from './publicContentReturn';
import type { WebActivationEvent } from './publicContentReturn';

export function startWebLogin(returnTarget?: string | null): void {
  window.location.assign(buildWebLoginHref(returnTarget));
}

export function startWebLoginFromPress(
  event: WebActivationEvent,
  returnTarget?: string | null,
): void {
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
  startWebLogin(returnTarget);
}
