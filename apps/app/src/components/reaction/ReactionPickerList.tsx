import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { FlatList, Platform, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import type { FlatListProps, ViewStyle } from 'react-native';

type PointerEvent = {
  nativeEvent: { button: number; isPrimary: boolean; pointerId: number; pageY: number };
  currentTarget: { setPointerCapture: (id: number) => void };
  preventDefault: () => void;
  stopPropagation: () => void;
};

type Drag = { pageY: number; offset: number; pointerId?: number };
type Interaction = { drag: Drag | null; request: { offset: number } | null };
type DragAction =
  | { type: 'begin'; drag: Drag }
  | { type: 'move'; pageY: number; pointerId?: number; range: number; travel: number }
  | { type: 'end'; pointerId?: number }
  | { type: 'reset' };

function updateDrag(state: Interaction, action: DragAction): Interaction {
  if (action.type === 'reset') {
    return { drag: null, request: null };
  }
  if (action.type === 'begin') {
    return state.drag ? state : { ...state, drag: action.drag };
  }
  if (!state.drag || state.drag.pointerId !== action.pointerId) {
    return state;
  }
  if (action.type === 'end') {
    return { ...state, drag: null };
  }
  if (action.travel <= 0) {
    return state;
  }
  const next =
    state.drag.offset + ((action.pageY - state.drag.pageY) / action.travel) * action.range;
  return { ...state, request: { offset: Math.min(action.range, Math.max(0, next)) } };
}

// Private to the picker: the grid reserves this gutter even while the thumb is hidden.
export const reactionScrollbarWidth = Platform.OS === 'web' ? space[24] : space[48];

export function ReactionPickerList<Item>({
  scrollbar,
  ...props
}: FlatListProps<Item> & { scrollbar: boolean }) {
  const theme = useTheme();
  const listId = useId();
  // Dragging must move the existing virtualized list through its platform scroll handle.
  const list = useRef<FlatList<Item>>(null);
  const [metrics, setMetrics] = useState({ content: 0, viewport: 0, offset: 0 });
  const [activity, setActivity] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const [{ drag, request }, dispatchDrag] = useReducer(updateDrag, { drag: null, request: null });
  const web = Platform.OS === 'web';
  const range = Math.max(0, metrics.content - metrics.viewport);
  const offset = Math.min(range, Math.max(0, metrics.offset));
  const target = web ? space[24] : Platform.OS === 'ios' ? 44 : space[48];
  const thumbHeight = Math.min(
    metrics.viewport,
    Math.max(target, metrics.viewport ** 2 / metrics.content),
  );
  const travel = metrics.viewport - thumbHeight;
  const visible = activity !== null || drag !== null || focused;

  // Native can batch grant/move/release before a render. Reduce them in order, then
  // synchronize the final request with the imperative platform list scroll handle.
  useEffect(() => {
    if (request) {
      list.current?.scrollToOffset({ offset: request.offset, animated: false });
      setMetrics((value) => ({ ...value, offset: request.offset }));
    }
  }, [request]);

  // Scroll events include inertia. Synchronize the idle timeout with that external event stream.
  useEffect(() => {
    if (activity === null || drag !== null || focused) {
      return;
    }
    const timeout = setTimeout(() => setActivity(null), 650);
    return () => clearTimeout(timeout);
  }, [activity, drag, focused]);

  const scrollTo = (next: number) => {
    const bounded = Math.min(range, Math.max(0, next));
    list.current?.scrollToOffset({ offset: bounded, animated: false });
    setMetrics((value) => ({ ...value, offset: bounded }));
  };
  const resize = (update: Partial<Pick<typeof metrics, 'content' | 'viewport'>>) => {
    setMetrics((previous) => {
      const next = { ...previous, ...update };
      return {
        ...next,
        offset: Math.min(Math.max(0, next.content - next.viewport), Math.max(0, previous.offset)),
      };
    });
    // Geometry changes invalidate the current gesture and any queued old-range request.
    dispatchDrag({ type: 'reset' });
  };
  const move = (pageY: number, pointerId?: number) => {
    dispatchDrag({ type: 'move', pageY, pointerId, range, travel });
  };
  const finish = (pointerId?: number) => {
    dispatchDrag({ type: 'end', pointerId });
    setActivity(null);
  };
  const webProps = web
    ? {
        role: 'scrollbar' as const,
        'aria-controls': listId,
        'aria-orientation': 'vertical' as const,
        'aria-valuemin': 0,
        'aria-valuemax': range,
        'aria-valuenow': offset,
        tabIndex: 0 as const,
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? range
                : event.key === 'ArrowDown' || event.key === 'PageDown'
                  ? offset + metrics.viewport
                  : event.key === 'ArrowUp' || event.key === 'PageUp'
                    ? offset - metrics.viewport
                    : undefined;
          if (next === undefined) {
            return;
          }
          event.preventDefault();
          scrollTo(next);
        },
        onPointerDown: (event: PointerEvent) => {
          const { button, isPrimary, pointerId, pageY } = event.nativeEvent;
          if (button !== 0 || !isPrimary || drag) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.setPointerCapture(pointerId);
          dispatchDrag({ type: 'begin', drag: { pageY, offset, pointerId } });
        },
        onPointerMove: (event: PointerEvent) => {
          move(event.nativeEvent.pageY, event.nativeEvent.pointerId);
        },
        onPointerUp: (event: PointerEvent) => {
          finish(event.nativeEvent.pointerId);
        },
        onPointerCancel: (event: PointerEvent) => {
          finish(event.nativeEvent.pointerId);
        },
        onLostPointerCapture: (event: PointerEvent) => {
          finish(event.nativeEvent.pointerId);
        },
      }
    : {
        onStartShouldSetResponder: () => visible,
        onResponderGrant: (event: { nativeEvent: { pageY: number } }) => {
          dispatchDrag({ type: 'begin', drag: { pageY: event.nativeEvent.pageY, offset } });
        },
        onResponderMove: (event: { nativeEvent: { pageY: number } }) =>
          move(event.nativeEvent.pageY),
        onResponderRelease: () => finish(),
        onResponderTerminate: () => finish(),
        onResponderTerminationRequest: () => false,
      };

  if (!scrollbar) {
    return <FlatList {...props} />;
  }

  return (
    <View style={styles.root}>
      <FlatList
        {...props}
        nativeID={listId}
        onContentSizeChange={(_width, height) => resize({ content: height })}
        onLayout={(event) => resize({ viewport: event.nativeEvent.layout.height })}
        onScroll={(event) => {
          const nextOffset = event.nativeEvent.contentOffset.y;
          setMetrics((value) => ({ ...value, offset: nextOffset }));
          setActivity((value) => (value ?? 0) + 1);
        }}
        ref={list}
        scrollEnabled={drag === null}
        scrollEventThrottle={16}
        style={styles.list}
      />
      <View style={styles.gutter}>
        {range > 0 && travel > 0 ? (
          <View
            {...webProps}
            accessible
            accessibilityLabel="반응 목록 스크롤"
            accessibilityRole="adjustable"
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            accessibilityValue={{ min: 0, max: range, now: offset }}
            onAccessibilityAction={(event) => {
              const direction =
                event.nativeEvent.actionName === 'increment'
                  ? 1
                  : event.nativeEvent.actionName === 'decrement'
                    ? -1
                    : 0;
              if (direction) {
                scrollTo(offset + direction * metrics.viewport);
                setActivity((value) => (value ?? 0) + 1);
              }
            }}
            onBlur={() => setFocused(false)}
            onFocus={() => setFocused(true)}
            pointerEvents={visible ? 'auto' : 'none'}
            style={[
              styles.target,
              web && ({ touchAction: 'none' } as unknown as ViewStyle),
              { height: thumbHeight, opacity: visible ? 1 : 0, top: (offset / range) * travel },
            ]}
            testID="full-reaction-picker-scrollbar"
          >
            <View
              pointerEvents="none"
              style={[styles.thumb, { backgroundColor: theme.foregroundSecondary }]}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', gap: space[4], minHeight: 0 },
  list: { flex: 1, minWidth: 0 },
  gutter: { width: reactionScrollbarWidth },
  target: { alignItems: 'center', position: 'absolute', width: '100%' },
  thumb: { borderRadius: radius.full, height: '100%', width: space[4] },
});
