export type PostThreadScrollMetrics = Readonly<{
  contentLength: number;
  offset: number;
  viewportLength: number;
}>;

export function isPostThreadNearEnd({
  contentLength,
  offset,
  viewportLength,
}: PostThreadScrollMetrics): boolean {
  return (
    contentLength > 0 &&
    viewportLength > 0 &&
    contentLength - offset - viewportLength <= viewportLength
  );
}

type PostThreadMetricsRef = { current: PostThreadScrollMetrics };
type PostThreadNativeLayoutEvent = { nativeEvent: { layout: { height: number } } };
type PostThreadNativeScrollEvent = {
  nativeEvent: {
    contentOffset: { y: number };
    contentSize: { height: number };
    layoutMeasurement: { height: number };
  };
};

export function createPostThreadNativeScrollHandlers(
  metricsRef: PostThreadMetricsRef,
  onMetrics: (metrics: PostThreadScrollMetrics) => void,
) {
  const emit = (patch: Partial<PostThreadScrollMetrics>) => {
    const metrics = { ...metricsRef.current, ...patch };
    metricsRef.current = metrics;
    onMetrics(metrics);
  };

  return {
    onContentSizeChange: (_width: number, height: number) => emit({ contentLength: height }),
    onLayout: (event: PostThreadNativeLayoutEvent) =>
      emit({ viewportLength: event.nativeEvent.layout.height }),
    onScroll: (event: PostThreadNativeScrollEvent) =>
      emit({
        contentLength: event.nativeEvent.contentSize.height,
        offset: event.nativeEvent.contentOffset.y,
        viewportLength: event.nativeEvent.layoutMeasurement.height,
      }),
    scrollEventThrottle: 16 as const,
  };
}
