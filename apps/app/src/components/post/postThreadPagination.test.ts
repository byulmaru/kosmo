import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostThreadNativeScrollHandlers, isPostThreadNearEnd } from './postThreadPagination';
import type { PostThreadScrollMetrics } from './postThreadPagination';

test('한 viewport 이내에서만 다음 Reply page를 요청한다', () => {
  assert.equal(
    isPostThreadNearEnd({ contentLength: 2400, offset: 800, viewportLength: 800 }),
    true,
  );
  assert.equal(
    isPostThreadNearEnd({ contentLength: 2401, offset: 800, viewportLength: 800 }),
    false,
  );
  assert.equal(isPostThreadNearEnd({ contentLength: 0, offset: 0, viewportLength: 0 }), false);
});

test('Native ScrollView event를 같은 metric 계약으로 합친다', () => {
  const metricsRef = {
    current: { contentLength: 0, offset: 0, viewportLength: 0 },
  };
  const observed: PostThreadScrollMetrics[] = [];
  const handlers = createPostThreadNativeScrollHandlers(metricsRef, (metrics) => {
    observed.push(metrics);
  });

  handlers.onLayout({ nativeEvent: { layout: { height: 800 } } });
  handlers.onContentSizeChange(0, 1200);
  assert.equal(isPostThreadNearEnd(observed.at(-1)!), true);

  handlers.onScroll({
    nativeEvent: {
      contentOffset: { y: 800 },
      contentSize: { height: 2401 },
      layoutMeasurement: { height: 800 },
    },
  });
  assert.deepEqual(observed.at(-1), {
    contentLength: 2401,
    offset: 800,
    viewportLength: 800,
  });
  assert.equal(isPostThreadNearEnd(observed.at(-1)!), false);
  assert.equal(handlers.scrollEventThrottle, 16);
});
