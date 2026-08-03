export type FollowRequestScrollMetrics = Readonly<{
  contentLength: number;
  offset: number;
  viewportLength: number;
}>;

export function isFollowRequestListNearEnd({
  contentLength,
  offset,
  viewportLength,
}: FollowRequestScrollMetrics): boolean {
  return (
    contentLength > 0 &&
    viewportLength > 0 &&
    contentLength - offset - viewportLength <= viewportLength
  );
}

type FollowRequestMetricsRef = { current: FollowRequestScrollMetrics };
type FollowRequestRequestRef = { current: boolean };
type FollowRequestNativeLayoutEvent = { nativeEvent: { layout: { height: number } } };
type FollowRequestNativeScrollEvent = {
  nativeEvent: {
    contentOffset: { y: number };
    contentSize: { height: number };
    layoutMeasurement: { height: number };
  };
};

export function resumeFollowRequestNativePagination(
  requestRef: FollowRequestRequestRef,
  metricsRef: FollowRequestMetricsRef,
  onMetrics: (metrics: FollowRequestScrollMetrics) => void,
) {
  requestRef.current = false;
  onMetrics(metricsRef.current);
}

export function createFollowRequestNativeScrollHandlers(
  metricsRef: FollowRequestMetricsRef,
  onMetrics: (metrics: FollowRequestScrollMetrics) => void,
) {
  const emit = (patch: Partial<FollowRequestScrollMetrics>) => {
    const metrics = { ...metricsRef.current, ...patch };
    metricsRef.current = metrics;
    onMetrics(metrics);
  };

  return {
    onContentSizeChange: (_width: number, height: number) => emit({ contentLength: height }),
    onLayout: (event: FollowRequestNativeLayoutEvent) =>
      emit({ viewportLength: event.nativeEvent.layout.height }),
    onScroll: (event: FollowRequestNativeScrollEvent) =>
      emit({
        contentLength: event.nativeEvent.contentSize.height,
        offset: event.nativeEvent.contentOffset.y,
        viewportLength: event.nativeEvent.layoutMeasurement.height,
      }),
    scrollEventThrottle: 16 as const,
  };
}
