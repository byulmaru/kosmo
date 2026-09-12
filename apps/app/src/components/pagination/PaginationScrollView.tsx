import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform, ScrollView } from 'react-native';
import type { Ref } from 'react';
import type { ScrollViewProps } from 'react-native';
import type { UseAutomaticPaginationResult } from './useAutomaticPagination';

type NativeScrollProps = UseAutomaticPaginationResult['nativeScrollProps'];
type NativeLayoutEvent = Parameters<NativeScrollProps['onLayout']>[0];
type NativeScrollEvent = Parameters<NativeScrollProps['onScroll']>[0];
type Registration = Readonly<{ id: symbol; props: NativeScrollProps }>;
type Register = (registration: Registration) => () => void;
type LatestEvent =
  | Readonly<{
      args: Parameters<NativeScrollProps['onContentSizeChange']>;
      type: 'contentSize';
    }>
  | Readonly<{ args: Parameters<NativeScrollProps['onLayout']>; type: 'layout' }>
  | Readonly<{ args: Parameters<NativeScrollProps['onScroll']>; type: 'scroll' }>;

const PaginationScrollContext = createContext<Register | null>(null);

type PaginationScrollViewProps = ScrollViewProps & { ref?: Ref<ScrollView> };

function recordLatestEvent(events: LatestEvent[], event: LatestEvent) {
  const previousIndex = events.findIndex((previous) => previous.type === event.type);
  if (previousIndex >= 0) {
    events.splice(previousIndex, 1);
  }
  events.push(event);
}

function snapshotLayoutEvent(event: NativeLayoutEvent): NativeLayoutEvent {
  return { nativeEvent: { layout: { height: event.nativeEvent.layout.height } } };
}

function snapshotScrollEvent(event: NativeScrollEvent): NativeScrollEvent {
  return {
    nativeEvent: {
      contentOffset: { y: event.nativeEvent.contentOffset.y },
      contentSize: { height: event.nativeEvent.contentSize.height },
      layoutMeasurement: { height: event.nativeEvent.layoutMeasurement.height },
    },
  };
}

export function PaginationScrollView({ children, ref, ...props }: PaginationScrollViewProps) {
  const registrationRef = useRef<Registration | null>(null);
  const latestEventsRef = useRef<LatestEvent[]>([]);
  const onContentSizeChange = useCallback(
    (...args: Parameters<NativeScrollProps['onContentSizeChange']>) => {
      recordLatestEvent(latestEventsRef.current, { args, type: 'contentSize' });
      const registration = registrationRef.current;
      const handler = registration?.props.onContentSizeChange;
      if (handler) {
        handler(...args);
      }
    },
    [],
  );
  const onLayout = useCallback((...args: Parameters<NativeScrollProps['onLayout']>) => {
    recordLatestEvent(latestEventsRef.current, {
      args: [snapshotLayoutEvent(args[0])],
      type: 'layout',
    });
    const registration = registrationRef.current;
    const handler = registration?.props.onLayout;
    if (handler) {
      handler(...args);
    }
  }, []);
  const onScroll = useCallback((...args: Parameters<NativeScrollProps['onScroll']>) => {
    recordLatestEvent(latestEventsRef.current, {
      args: [snapshotScrollEvent(args[0])],
      type: 'scroll',
    });
    const registration = registrationRef.current;
    const handler = registration?.props.onScroll;
    if (handler) {
      handler(...args);
    }
  }, []);
  const register = useCallback<Register>((registration) => {
    registrationRef.current = registration;
    for (const event of latestEventsRef.current) {
      if (event.type === 'contentSize') {
        registration.props.onContentSizeChange(...event.args);
      } else if (event.type === 'layout') {
        registration.props.onLayout(...event.args);
      } else {
        registration.props.onScroll(...event.args);
      }
    }
    return () => {
      if (registrationRef.current?.id === registration.id) {
        registrationRef.current = null;
      }
    };
  }, []);
  const nativeScrollProps =
    Platform.OS === 'web'
      ? {}
      : { onContentSizeChange, onLayout, onScroll, scrollEventThrottle: 16 as const };

  return (
    <PaginationScrollContext.Provider value={register}>
      <ScrollView ref={ref} {...props} {...nativeScrollProps}>
        {children}
      </ScrollView>
    </PaginationScrollContext.Provider>
  );
}

export function usePaginationScrollContext() {
  return useContext(PaginationScrollContext) !== null;
}

export function usePaginationScrollRegistration(props: NativeScrollProps | null) {
  const register = useContext(PaginationScrollContext);
  const id = useRef(Symbol('pagination-scroll-registration'));

  useEffect(() => {
    if (!register || !props || Platform.OS === 'web') {
      return;
    }

    return register({ id: id.current, props });
  }, [props, register]);
}
