import { createContext, useCallback, useContext, useEffect, useRef } from 'react';
import { Platform, ScrollView } from 'react-native';
import type { ScrollViewProps } from 'react-native';
import type { UseAutomaticPaginationResult } from './useAutomaticPagination';

type NativeScrollProps = UseAutomaticPaginationResult['nativeScrollProps'];
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

function recordLatestEvent(events: LatestEvent[], event: LatestEvent) {
  const previousIndex = events.findIndex((previous) => previous.type === event.type);
  if (previousIndex >= 0) {
    events.splice(previousIndex, 1);
  }
  events.push(event);
}

export function PaginationScrollView({ children, ...props }: ScrollViewProps) {
  const registrationRef = useRef<Registration | null>(null);
  const latestEventsRef = useRef<LatestEvent[]>([]);
  const onContentSizeChange = useCallback(
    (...args: Parameters<NativeScrollProps['onContentSizeChange']>) => {
      recordLatestEvent(latestEventsRef.current, { args, type: 'contentSize' });
      const handler = registrationRef.current?.props.onContentSizeChange;
      if (handler) {
        handler(...args);
      }
    },
    [],
  );
  const onLayout = useCallback((...args: Parameters<NativeScrollProps['onLayout']>) => {
    recordLatestEvent(latestEventsRef.current, { args, type: 'layout' });
    const handler = registrationRef.current?.props.onLayout;
    if (handler) {
      handler(...args);
    }
  }, []);
  const onScroll = useCallback((...args: Parameters<NativeScrollProps['onScroll']>) => {
    recordLatestEvent(latestEventsRef.current, { args, type: 'scroll' });
    const handler = registrationRef.current?.props.onScroll;
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
      <ScrollView {...props} {...nativeScrollProps}>
        {children}
      </ScrollView>
    </PaginationScrollContext.Provider>
  );
}

export function usePaginationScrollRegistration(props: NativeScrollProps) {
  const register = useContext(PaginationScrollContext);
  const id = useRef(Symbol('pagination-scroll-registration'));

  useEffect(() => {
    if (!register || Platform.OS === 'web') {
      return;
    }

    return register({ id: id.current, props });
  }, [props, register]);
}
