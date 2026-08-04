import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createNativeScrollHandlers,
  isScrollNearEnd,
  resumeNativePagination,
} from './nativeScrollPagination';
import type { ScrollMetrics } from './nativeScrollPagination';

test('한 viewport 이내에서만 다음 page를 요청한다', () => {
  assert.equal(isScrollNearEnd({ contentLength: 2400, offset: 800, viewportLength: 800 }), true);
  assert.equal(isScrollNearEnd({ contentLength: 2401, offset: 800, viewportLength: 800 }), false);
  assert.equal(isScrollNearEnd({ contentLength: 0, offset: 0, viewportLength: 0 }), false);
  assert.equal(isScrollNearEnd({ contentLength: 0, offset: 0, viewportLength: 800 }), false);
});

test('Native ScrollView event를 같은 metric 계약으로 합친다', () => {
  const metricsRef = {
    current: { contentLength: 0, offset: 0, viewportLength: 0 },
  };
  const observed: ScrollMetrics[] = [];
  const handlers = createNativeScrollHandlers(metricsRef, (metrics) => {
    observed.push(metrics);
  });

  handlers.onLayout({ nativeEvent: { layout: { height: 800 } } });
  assert.equal(isScrollNearEnd(observed.at(-1)!), false);
  handlers.onContentSizeChange(0, 1200);
  assert.equal(isScrollNearEnd(observed.at(-1)!), true);

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
  assert.equal(isScrollNearEnd(observed.at(-1)!), false);
  assert.equal(handlers.scrollEventThrottle, 16);
});

test('성공한 Native page 뒤 guard를 해제하고 저장된 metrics를 다시 검사한다', () => {
  const requestRef = { current: true };
  const metricsRef = {
    current: { contentLength: 800, offset: 0, viewportLength: 800 },
  };
  let nextPageRequests = 0;

  resumeNativePagination(requestRef, metricsRef, (metrics) => {
    assert.equal(requestRef.current, false);
    if (isScrollNearEnd(metrics)) {
      nextPageRequests += 1;
    }
  });

  assert.equal(nextPageRequests, 1);
});
