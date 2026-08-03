export type ScrollMetrics = Readonly<{
  contentLength: number;
  offset: number;
  viewportLength: number;
}>;

export function isScrollNearEnd({ contentLength, offset, viewportLength }: ScrollMetrics): boolean {
  return (
    contentLength > 0 &&
    viewportLength > 0 &&
    contentLength - offset - viewportLength <= viewportLength
  );
}

type MetricsRef = { current: ScrollMetrics };
type RequestRef = { current: boolean };
type NativeLayoutEvent = { nativeEvent: { layout: { height: number } } };
type NativeScrollEvent = {
  nativeEvent: {
    contentOffset: { y: number };
    contentSize: { height: number };
    layoutMeasurement: { height: number };
  };
};

export function resumeNativePagination(
  requestRef: RequestRef,
  metricsRef: MetricsRef,
  onMetrics: (metrics: ScrollMetrics) => void,
) {
  requestRef.current = false;
  onMetrics(metricsRef.current);
}

export function createNativeScrollHandlers(
  metricsRef: MetricsRef,
  onMetrics: (metrics: ScrollMetrics) => void,
) {
  const emit = (patch: Partial<ScrollMetrics>) => {
    const metrics = { ...metricsRef.current, ...patch };
    metricsRef.current = metrics;
    onMetrics(metrics);
  };

  return {
    onContentSizeChange: (_width: number, height: number) => emit({ contentLength: height }),
    onLayout: (event: NativeLayoutEvent) =>
      emit({ viewportLength: event.nativeEvent.layout.height }),
    onScroll: (event: NativeScrollEvent) =>
      emit({
        contentLength: event.nativeEvent.contentSize.height,
        offset: event.nativeEvent.contentOffset.y,
        viewportLength: event.nativeEvent.layoutMeasurement.height,
      }),
    scrollEventThrottle: 16 as const,
  };
}
