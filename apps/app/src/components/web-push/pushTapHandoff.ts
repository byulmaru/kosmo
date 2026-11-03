const PUSH_TAP_CACHE = 'kosmo-web-push-taps-v1';
const PUSH_TAP_PATH = '/__kosmo-push-taps/';
const PUSH_TAP_ID = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;

function getPushTapKey(tap: unknown): string | null {
  if (typeof tap !== 'string' || !PUSH_TAP_ID.test(tap) || typeof window === 'undefined') {
    return null;
  }
  return `${window.location.origin}${PUSH_TAP_PATH}${tap}`;
}

export async function readWebPushTap(tap: unknown): Promise<unknown> {
  const key = getPushTapKey(tap);
  if (!key || typeof caches === 'undefined') {
    return null;
  }
  try {
    const cache = await caches.open(PUSH_TAP_CACHE);
    const response = await cache.match(key);
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function clearWebPushTap(tap: unknown): Promise<void> {
  const key = getPushTapKey(tap);
  if (!key || typeof caches === 'undefined') {
    return;
  }

  try {
    const cache = await caches.open(PUSH_TAP_CACHE);
    await cache.delete(key);
  } catch {
    // Cache cleanup is best-effort after the target has been handled.
  }
}
