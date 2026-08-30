import { TriangleAlert } from 'lucide-react-native';
import { useEffect, useId, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useElevation, useTheme } from '@/theme/ThemeProvider';
import { borderWidths, colors, radius, space, textStyles } from '@/theme/tokens';
import type { GestureResponderEvent, LayoutChangeEvent, ViewStyle } from 'react-native';

const SURFACE_HEIGHT = 180;
const SURFACE_WIDTH_FALLBACK = 328;
const INTERACTION_SIZE = 48;
const CURSOR_SIZE = 20;
const HUE_TRACK_HEIGHT = 12;
const SURFACE_ACCESSIBILITY_ACTIONS = [
  { name: 'increment' },
  { name: 'decrement' },
  { label: '밝기 높이기', name: 'increase-brightness' },
  { label: '밝기 낮추기', name: 'decrease-brightness' },
] as const;

export type ColorPickerValue = {
  brightness: number;
  hue: number;
  saturation: number;
};

export type ColorPickerPanelProps = {
  contrastWarning?: string;
  disabled?: boolean;
  hexAccessibilityLabel?: string;
  hueAccessibilityLabel?: string;
  onCancel: () => void;
  onChange: (value: ColorPickerValue) => void;
  onCommit: (value: ColorPickerValue) => void;
  surfaceAccessibilityLabel?: string;
  title?: string;
  value: ColorPickerValue;
};

type KeyEvent = {
  key: string;
  preventDefault: () => void;
};

type WebSliderProps = {
  'aria-disabled': boolean;
  'aria-valuemax': number;
  'aria-valuemin': number;
  'aria-valuenow': number;
  'aria-valuetext'?: string;
  onKeyDown: (event: KeyEvent) => void;
  onPointerDown: () => void;
  role: 'slider';
  tabIndex: -1 | 0;
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function normalizeValue(value: ColorPickerValue): ColorPickerValue {
  return {
    brightness: clamp(value.brightness, 0, 100),
    hue: clamp(value.hue, 0, 360),
    saturation: clamp(value.saturation, 0, 100),
  };
}

function hsbToHex(value: ColorPickerValue): string {
  const normalized = normalizeValue(value);
  const hue = normalized.hue === 360 ? 0 : normalized.hue;
  const saturation = normalized.saturation / 100;
  const brightness = normalized.brightness / 100;
  const chroma = brightness * saturation;
  const sector = hue / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = brightness - chroma;
  const [red, green, blue] =
    sector < 1
      ? [chroma, secondary, 0]
      : sector < 2
        ? [secondary, chroma, 0]
        : sector < 3
          ? [0, chroma, secondary]
          : sector < 4
            ? [0, secondary, chroma]
            : sector < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const channel = (component: number) =>
    Math.round((component + offset) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function hexToHsb(rawText: string): ColorPickerValue | null {
  const match = /^#([0-9a-f]{6})$/i.exec(rawText);
  if (!match) {
    return null;
  }

  const hex = match[1];
  if (!hex) {
    return null;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const hue =
    delta === 0
      ? 0
      : maximum === red
        ? 60 * (((green - blue) / delta) % 6)
        : maximum === green
          ? 60 * ((blue - red) / delta + 2)
          : 60 * ((red - green) / delta + 4);
  const round = (number: number) => Number(number.toFixed(2));
  return {
    brightness: round(maximum * 100),
    hue: round(hue < 0 ? hue + 360 : hue),
    saturation: round(maximum === 0 ? 0 : (delta / maximum) * 100),
  };
}

function focusIsVisible(event: { currentTarget: unknown }): boolean {
  const target = event.currentTarget as { matches?: (selector: string) => boolean };
  return Boolean(target.matches?.(':focus-visible'));
}

function stopKey(
  event: KeyEvent,
  nextValue: ColorPickerValue,
  onChange: (value: ColorPickerValue) => void,
) {
  event.preventDefault();
  onChange(normalizeValue(nextValue));
}

function eventCoordinate(event: GestureResponderEvent, axis: 'x' | 'y'): number | undefined {
  const nativeEvent = event.nativeEvent as unknown as {
    clientX?: number;
    clientY?: number;
    locationX?: number;
    locationY?: number;
    pageX?: number;
    pageY?: number;
  };
  const location = axis === 'x' ? nativeEvent.locationX : nativeEvent.locationY;
  if (Number.isFinite(location)) {
    return location;
  }

  const client = axis === 'x' ? nativeEvent.clientX : nativeEvent.clientY;
  const page = axis === 'x' ? nativeEvent.pageX : nativeEvent.pageY;
  const target = event.currentTarget as unknown as
    | {
        getBoundingClientRect?: () => { left: number; top: number };
      }
    | null
    | undefined;
  const origin = target?.getBoundingClientRect?.();
  const globalCoordinate = Number.isFinite(client) ? client : page;
  if (origin && typeof globalCoordinate === 'number' && Number.isFinite(globalCoordinate)) {
    return globalCoordinate - (axis === 'x' ? origin.left : origin.top);
  }

  return undefined;
}

export function ColorPickerPanel({
  contrastWarning,
  disabled = false,
  hexAccessibilityLabel = 'HEX 색상',
  hueAccessibilityLabel = '색상 색조',
  onCancel,
  onChange,
  onCommit,
  surfaceAccessibilityLabel,
  title = '색상 선택',
  value,
}: ColorPickerPanelProps) {
  const theme = useTheme();
  const elevation = useElevation();
  const web = Platform.OS === 'web';
  const gradientId = useId().replace(/:/g, '');
  const [surfaceWidth, setSurfaceWidth] = useState(SURFACE_WIDTH_FALLBACK);
  const [hueWidth, setHueWidth] = useState(SURFACE_WIDTH_FALLBACK);
  const [surfaceFocusVisible, setSurfaceFocusVisible] = useState(false);
  const [hueFocusVisible, setHueFocusVisible] = useState(false);
  const currentValue = normalizeValue(value);
  const color = hsbToHex(currentValue);
  const [hexDraft, setHexDraft] = useState(color);
  const [hexFocused, setHexFocused] = useState(false);
  const surfaceLabel = surfaceAccessibilityLabel ?? '채도 및 밝기';
  const surfaceX = (currentValue.saturation / 100) * surfaceWidth;
  const surfaceY = ((100 - currentValue.brightness) / 100) * SURFACE_HEIGHT;
  const hueX = (currentValue.hue / 360) * hueWidth;

  useEffect(() => {
    if (!hexFocused) {
      setHexDraft(color);
    }
  }, [color, hexFocused]);

  const emitValue = (nextValue: ColorPickerValue) => {
    if (!disabled) {
      const next = normalizeValue(nextValue);
      if (
        next.brightness === currentValue.brightness &&
        next.hue === currentValue.hue &&
        next.saturation === currentValue.saturation
      ) {
        return;
      }
      onChange(next);
    }
  };

  const onSurfacePress = (event: GestureResponderEvent) => {
    const locationX = eventCoordinate(event, 'x');
    const locationY = eventCoordinate(event, 'y');
    if (locationX === undefined || locationY === undefined) {
      return;
    }
    emitValue({
      ...currentValue,
      brightness: 100 - (clamp(locationY, 0, SURFACE_HEIGHT) / SURFACE_HEIGHT) * 100,
      saturation: (clamp(locationX, 0, surfaceWidth) / surfaceWidth) * 100,
    });
  };

  const onHuePress = (event: GestureResponderEvent) => {
    const locationX = eventCoordinate(event, 'x');
    if (locationX === undefined) {
      return;
    }
    emitValue({
      ...currentValue,
      hue: (clamp(locationX, 0, hueWidth) / hueWidth) * 360,
    });
  };

  const onSurfaceKeyDown = (event: KeyEvent) => {
    if (disabled || !web) {
      return;
    }
    const nextValue =
      event.key === 'ArrowRight'
        ? { ...currentValue, saturation: currentValue.saturation + 1 }
        : event.key === 'ArrowLeft'
          ? { ...currentValue, saturation: currentValue.saturation - 1 }
          : event.key === 'ArrowUp'
            ? { ...currentValue, brightness: currentValue.brightness + 1 }
            : event.key === 'ArrowDown'
              ? { ...currentValue, brightness: currentValue.brightness - 1 }
              : undefined;
    if (nextValue) {
      stopKey(event, nextValue, emitValue);
    }
  };

  const onHueKeyDown = (event: KeyEvent) => {
    if (disabled || !web) {
      return;
    }
    const nextHue =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? currentValue.hue + 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? currentValue.hue - 1
          : undefined;
    if (nextHue !== undefined) {
      stopKey(event, { ...currentValue, hue: nextHue }, emitValue);
    }
  };

  const onSurfaceAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    const actionName = event.nativeEvent.actionName;
    const nextValue =
      actionName === 'increment'
        ? { ...currentValue, saturation: currentValue.saturation + 1 }
        : actionName === 'decrement'
          ? { ...currentValue, saturation: currentValue.saturation - 1 }
          : actionName === 'increase-brightness'
            ? { ...currentValue, brightness: currentValue.brightness + 1 }
            : actionName === 'decrease-brightness'
              ? { ...currentValue, brightness: currentValue.brightness - 1 }
              : undefined;
    if (nextValue) {
      emitValue(nextValue);
    }
  };

  const onHueAccessibilityAction = (event: { nativeEvent: { actionName: string } }) => {
    const direction =
      event.nativeEvent.actionName === 'increment'
        ? 1
        : event.nativeEvent.actionName === 'decrement'
          ? -1
          : 0;
    if (direction !== 0) {
      emitValue({ ...currentValue, hue: currentValue.hue + direction });
    }
  };

  const onHueLayout = (event: LayoutChangeEvent) => {
    setHueWidth(Math.max(1, event.nativeEvent.layout.width));
  };

  return (
    <View
      accessibilityLabel={title}
      style={[
        styles.panel,
        {
          backgroundColor: theme.backgroundElevated,
          borderColor: theme.borderDefault,
        },
        elevation.floating,
      ]}
      testID="color-picker-panel"
    >
      <Text accessibilityRole="header" style={[styles.title, { color: theme.foregroundPrimary }]}>
        {title}
      </Text>

      <View style={styles.controls}>
        <Pressable
          accessibilityActions={SURFACE_ACCESSIBILITY_ACTIONS}
          accessibilityLabel={surfaceLabel}
          accessibilityRole="adjustable"
          accessibilityState={{ disabled }}
          accessibilityValue={{
            max: 100,
            min: 0,
            now: currentValue.saturation,
            text: `채도 ${currentValue.saturation}, 밝기 ${currentValue.brightness}`,
          }}
          disabled={disabled}
          onAccessibilityAction={onSurfaceAccessibilityAction}
          onBlur={() => setSurfaceFocusVisible(false)}
          onFocus={(event) => {
            if (web) {
              setSurfaceFocusVisible(focusIsVisible(event));
            }
          }}
          onLayout={(event) => {
            setSurfaceWidth(Math.max(1, event.nativeEvent.layout.width));
          }}
          onPress={onSurfacePress}
          style={(state) => {
            const webState = state as { hovered?: boolean; pressed?: boolean };
            return [
              styles.surfaceTarget,
              {
                backgroundColor: disabled
                  ? theme.stateDisabledSurface
                  : webState.pressed
                    ? theme.statePressed
                    : undefined,
                ...(web && surfaceFocusVisible
                  ? ({
                      outlineColor: theme.stateFocusRing,
                      outlineOffset: 2,
                      outlineStyle: 'solid',
                      outlineWidth: borderWidths[2],
                    } as unknown as ViewStyle)
                  : ({ outlineStyle: 'none' } as unknown as ViewStyle)),
              },
            ];
          }}
          testID="color-picker-surface"
          {...(web
            ? ({
                'aria-disabled': disabled,
                'aria-valuemax': 100,
                'aria-valuemin': 0,
                'aria-valuenow': currentValue.saturation,
                'aria-valuetext': `채도 ${currentValue.saturation}, 밝기 ${currentValue.brightness}`,
                onKeyDown: onSurfaceKeyDown,
                onPointerDown: () => setSurfaceFocusVisible(false),
                role: 'slider',
                tabIndex: disabled ? -1 : 0,
              } as WebSliderProps)
            : undefined)}
        >
          <View pointerEvents="none" style={styles.surfaceCanvas}>
            <Svg height={SURFACE_HEIGHT} width="100%">
              <Defs>
                <LinearGradient id={`${gradientId}-white`} x1="0" x2="1" y1="0" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity="1" />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
                </LinearGradient>
                <LinearGradient id={`${gradientId}-black`} x1="0" x2="0" y1="0" y2="1">
                  <Stop offset="0" stopColor="#000000" stopOpacity="0" />
                  <Stop offset="1" stopColor="#000000" stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect fill={`hsl(${currentValue.hue}, 100%, 50%)`} height="100%" width="100%" />
              <Rect fill={`url(#${gradientId}-white)`} height="100%" width="100%" />
              <Rect fill={`url(#${gradientId}-black)`} height="100%" width="100%" />
            </Svg>
          </View>
          <View
            pointerEvents="none"
            style={[styles.surfaceHandle, { left: surfaceX, top: surfaceY }]}
            testID="color-picker-surface-handle"
          >
            <View
              style={{
                ...styles.surfaceCursor,
                borderColor: disabled ? theme.stateDisabledForeground : theme.fixedWhite,
              }}
              testID="color-picker-surface-cursor"
            />
          </View>
        </Pressable>

        <Pressable
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          accessibilityLabel={hueAccessibilityLabel}
          accessibilityRole="adjustable"
          accessibilityState={{ disabled }}
          accessibilityValue={{ max: 360, min: 0, now: currentValue.hue }}
          disabled={disabled}
          onAccessibilityAction={onHueAccessibilityAction}
          onBlur={() => setHueFocusVisible(false)}
          onFocus={(event) => {
            if (web) {
              setHueFocusVisible(focusIsVisible(event));
            }
          }}
          onLayout={onHueLayout}
          onPress={onHuePress}
          style={(state) => {
            const webState = state as { pressed?: boolean };
            return [
              styles.hueTarget,
              {
                backgroundColor: disabled
                  ? theme.stateDisabledSurface
                  : webState.pressed
                    ? theme.statePressed
                    : undefined,
                ...(web && hueFocusVisible
                  ? ({
                      outlineColor: theme.stateFocusRing,
                      outlineOffset: 2,
                      outlineStyle: 'solid',
                      outlineWidth: borderWidths[2],
                    } as unknown as ViewStyle)
                  : ({ outlineStyle: 'none' } as unknown as ViewStyle)),
              },
            ];
          }}
          testID="color-picker-hue"
          {...(web
            ? ({
                'aria-disabled': disabled,
                'aria-valuemax': 360,
                'aria-valuemin': 0,
                'aria-valuenow': currentValue.hue,
                onKeyDown: onHueKeyDown,
                onPointerDown: () => setHueFocusVisible(false),
                role: 'slider',
                tabIndex: disabled ? -1 : 0,
              } as WebSliderProps)
            : undefined)}
        >
          <View pointerEvents="none" style={styles.hueTrack} testID="color-picker-hue-track">
            <Svg height={HUE_TRACK_HEIGHT} width="100%">
              <Defs>
                <LinearGradient id={`${gradientId}-hue`} x1="0" x2="1" y1="0" y2="0">
                  <Stop offset="0" stopColor="#FF0000" />
                  <Stop offset="0.17" stopColor="#FFFF00" />
                  <Stop offset="0.33" stopColor="#00FF00" />
                  <Stop offset="0.5" stopColor="#00FFFF" />
                  <Stop offset="0.67" stopColor="#0000FF" />
                  <Stop offset="0.83" stopColor="#FF00FF" />
                  <Stop offset="1" stopColor="#FF0000" />
                </LinearGradient>
              </Defs>
              <Rect
                fill={`url(#${gradientId}-hue)`}
                height="100%"
                rx={HUE_TRACK_HEIGHT / 2}
                width="100%"
              />
            </Svg>
          </View>
          <View
            pointerEvents="none"
            style={[styles.hueHandle, { left: hueX }]}
            testID="color-picker-hue-handle"
          >
            <View
              style={[
                styles.hueThumb,
                {
                  backgroundColor: disabled ? theme.stateDisabledForeground : color,
                  borderColor: theme.fixedWhite,
                },
              ]}
              testID="color-picker-hue-thumb"
            />
          </View>
        </Pressable>
      </View>

      <View style={styles.colorValueRow}>
        <View style={styles.currentSwatchTarget} testID="color-picker-current-swatch-target">
          <View
            style={[styles.currentSwatch, { backgroundColor: color }]}
            testID="color-picker-current-swatch"
          />
        </View>
        <View style={styles.hexField} testID="color-picker-hex-field">
          <TextField
            accessibilityLabel={hexAccessibilityLabel}
            editable={!disabled}
            label="HEX"
            onBlur={() => {
              setHexFocused(false);
              setHexDraft(color);
            }}
            onChangeText={(rawText) => {
              if (!disabled) {
                setHexDraft(rawText);
                const nextValue = hexToHsb(rawText);
                if (nextValue) {
                  emitValue(nextValue);
                }
              }
            }}
            onFocus={() => setHexFocused(true)}
            value={hexDraft}
          />
        </View>
      </View>

      <View style={styles.previewCards} testID="color-picker-preview-cards">
        <View
          style={[styles.previewCard, { backgroundColor: colors.light.backgroundSurface }]}
          testID="color-picker-preview-light"
        >
          <Text style={[styles.previewLabel, { color: colors.light.foregroundPrimary }]}>
            Light
          </Text>
          <View
            style={[styles.previewSample, { backgroundColor: colors.light.backgroundSurface }]}
            testID="color-picker-preview-light-sample"
          >
            <Text style={[styles.previewText, { color }]}>Aa</Text>
          </View>
        </View>
        <View
          style={[styles.previewCard, { backgroundColor: colors.dark.backgroundSurface }]}
          testID="color-picker-preview-dark"
        >
          <Text style={[styles.previewLabel, { color: colors.dark.foregroundPrimary }]}>Dark</Text>
          <View
            style={[styles.previewSample, { backgroundColor: colors.dark.backgroundSurface }]}
            testID="color-picker-preview-dark-sample"
          >
            <Text style={[styles.previewText, { color }]}>Aa</Text>
          </View>
        </View>
      </View>

      {contrastWarning ? (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.warning,
            {
              backgroundColor: theme.feedbackWarningSubtle,
              borderColor: theme.feedbackWarningBorder,
            },
          ]}
          testID="color-picker-warning"
        >
          <View
            accessible={false}
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={styles.warningIcon}
            testID="color-picker-warning-icon"
          >
            <TriangleAlert color={theme.feedbackWarningOnSubtle} size={20} strokeWidth={2} />
          </View>
          <Text style={[styles.warningText, { color: theme.feedbackWarningOnSubtle }]}>
            {contrastWarning}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button
          accessibilityLabel="취소"
          disabled={disabled}
          onPress={() => {
            if (!disabled) {
              onCancel();
            }
          }}
          style={styles.actionButton}
          tone="secondary"
        >
          취소
        </Button>
        <Button
          accessibilityLabel="적용"
          disabled={disabled}
          onPress={() => {
            if (!disabled) {
              onCommit(currentValue);
            }
          }}
          style={styles.actionButton}
        >
          적용
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: space[8],
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
  },
  colorValueRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space[12],
  },
  controls: {
    alignItems: 'center',
    gap: space[8],
  },
  currentSwatch: {
    borderRadius: radius[8],
    height: 32,
    width: 32,
  },
  currentSwatchTarget: {
    alignItems: 'center',
    borderRadius: radius[8],
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  hexField: {
    flex: 1,
  },
  hueTarget: {
    justifyContent: 'center',
    minHeight: INTERACTION_SIZE,
    position: 'relative',
    width: '100%',
  },
  hueThumb: {
    borderRadius: radius.full,
    borderWidth: borderWidths[2],
    height: CURSOR_SIZE,
    width: CURSOR_SIZE,
  },
  hueTrack: {
    height: HUE_TRACK_HEIGHT,
    overflow: 'hidden',
    width: '100%',
  },
  panel: {
    borderColor: 'transparent',
    borderWidth: borderWidths[1],
    borderRadius: radius[12],
    gap: space[16],
    padding: space[16] - borderWidths[1],
  },
  previewCard: {
    alignItems: 'center',
    borderRadius: radius[8],
    flex: 1,
    gap: space[8],
    padding: space[8],
  },
  previewCards: {
    flexDirection: 'row',
    gap: space[12],
  },
  previewSample: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    width: '100%',
  },
  previewText: textStyles.uiLabelL,
  surfaceCanvas: {
    height: SURFACE_HEIGHT,
    width: '100%',
  },
  surfaceCursor: {
    borderRadius: radius.full,
    borderWidth: borderWidths[2],
    height: CURSOR_SIZE,
    width: CURSOR_SIZE,
  },
  surfaceHandle: {
    alignItems: 'center',
    height: INTERACTION_SIZE,
    justifyContent: 'center',
    marginLeft: -INTERACTION_SIZE / 2,
    marginTop: -INTERACTION_SIZE / 2,
    position: 'absolute',
    width: INTERACTION_SIZE,
  },
  surfaceTarget: {
    borderRadius: radius[8],
    height: SURFACE_HEIGHT,
    minHeight: INTERACTION_SIZE,
    minWidth: INTERACTION_SIZE,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  previewLabel: textStyles.uiLabelS,
  title: textStyles.uiHeadingS,
  warning: {
    alignItems: 'center',
    borderRadius: radius[8],
    borderWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[8],
    padding: space[8],
  },
  warningIcon: {
    height: 20,
    width: 20,
  },
  warningText: {
    flex: 1,
    ...textStyles.uiCopyS,
  },
  hueHandle: {
    alignItems: 'center',
    height: INTERACTION_SIZE,
    justifyContent: 'center',
    marginLeft: -INTERACTION_SIZE / 2,
    position: 'absolute',
    top: 0,
    width: INTERACTION_SIZE,
  },
});
