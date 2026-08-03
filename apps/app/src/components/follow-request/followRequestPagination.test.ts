import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

type FollowRequestScrollMetrics = Readonly<{
  contentLength: number;
  offset: number;
  viewportLength: number;
}>;

type PaginationModule = {
  createFollowRequestNativeScrollHandlers: (
    metricsRef: { current: FollowRequestScrollMetrics },
    onMetrics: (metrics: FollowRequestScrollMetrics) => void,
  ) => {
    onContentSizeChange: (width: number, height: number) => void;
    onLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;
    onScroll: (event: {
      nativeEvent: {
        contentOffset: { y: number };
        contentSize: { height: number };
        layoutMeasurement: { height: number };
      };
    }) => void;
    scrollEventThrottle: 16;
  };
  isFollowRequestListNearEnd: (metrics: FollowRequestScrollMetrics) => boolean;
  resumeFollowRequestNativePagination: (
    requestRef: { current: boolean },
    metricsRef: { current: FollowRequestScrollMetrics },
    onMetrics: (metrics: FollowRequestScrollMetrics) => void,
  ) => void;
};

let pagination: PaginationModule | null = null;

before(async () => {
  pagination = (await import('./followRequestPagination').catch(() => null)) as PaginationModule;
});

function requirePagination(): PaginationModule {
  assert.ok(pagination, 'followRequestPagination module must exist');
  return pagination;
}

describe('follow request automatic pagination metrics', () => {
  it('목록 끝 한 viewport 이내에서만 다음 page를 요청한다', () => {
    const { isFollowRequestListNearEnd } = requirePagination();

    assert.equal(
      isFollowRequestListNearEnd({ contentLength: 2400, offset: 800, viewportLength: 800 }),
      true,
    );
    assert.equal(
      isFollowRequestListNearEnd({ contentLength: 2401, offset: 800, viewportLength: 800 }),
      false,
    );
    assert.equal(
      isFollowRequestListNearEnd({ contentLength: 0, offset: 0, viewportLength: 800 }),
      false,
    );
    assert.equal(
      isFollowRequestListNearEnd({ contentLength: 800, offset: 0, viewportLength: 0 }),
      false,
    );
  });

  it('Native ScrollView event를 같은 metric 계약으로 합친다', () => {
    const { createFollowRequestNativeScrollHandlers, isFollowRequestListNearEnd } =
      requirePagination();
    const metricsRef = {
      current: { contentLength: 0, offset: 0, viewportLength: 0 },
    };
    const observed: FollowRequestScrollMetrics[] = [];
    const handlers = createFollowRequestNativeScrollHandlers(metricsRef, (metrics) => {
      observed.push(metrics);
    });

    handlers.onLayout({ nativeEvent: { layout: { height: 800 } } });
    assert.equal(isFollowRequestListNearEnd(observed.at(-1)!), false);
    handlers.onContentSizeChange(0, 1200);
    assert.equal(isFollowRequestListNearEnd(observed.at(-1)!), true);
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
    assert.equal(handlers.scrollEventThrottle, 16);
  });

  it('성공한 Native page 뒤 guard를 해제하고 저장된 위치를 다시 검사한다', () => {
    const { isFollowRequestListNearEnd, resumeFollowRequestNativePagination } = requirePagination();
    const requestRef = { current: true };
    const metricsRef = {
      current: { contentLength: 800, offset: 0, viewportLength: 800 },
    };
    let nextPageRequests = 0;

    resumeFollowRequestNativePagination(requestRef, metricsRef, (metrics) => {
      assert.equal(requestRef.current, false);
      if (isFollowRequestListNearEnd(metrics)) {
        nextPageRequests += 1;
      }
    });

    assert.equal(nextPageRequests, 1);
  });
});
