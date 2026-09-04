import { Search, X } from 'lucide-react-native';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ProfileTagChip } from '@/components/profile/ProfileTagChip';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, iconSizes, radius, space, textStyles } from '@/theme/tokens';
import { ICON_BUTTON_TARGET_SIZE, IconButton } from './IconButton';
import { ListboxOption } from './ListboxOption';
import { TextField } from './TextField';
import type { ReactNode } from 'react';
import type { TextInput, TextInputKeyPressEvent, TextInputProps } from 'react-native';

export type MultiSelectOption = {
  disabled?: boolean;
  label: string;
  value: string;
};

export type MultiSelectComboboxProps = {
  createOptionLabel?: string;
  disabled?: boolean;
  emptyMessage?: string;
  onCreateOption?: (query: string) => void;
  onQueryChange: (query: string) => void;
  onSelectedOptionsChange: (next: ReadonlyArray<MultiSelectOption>) => void;
  options: ReadonlyArray<MultiSelectOption>;
  placeholder?: string;
  query: string;
  searchLabel: string;
  selectedLabel: string;
  selectedOptions: ReadonlyArray<MultiSelectOption>;
};

type InputWebProps = {
  'aria-activedescendant'?: string;
  'aria-autocomplete': 'list';
  'aria-controls': string;
  'aria-disabled': boolean;
  'aria-expanded': boolean;
  role: 'combobox';
};

function nextEnabledIndex(
  options: ReadonlyArray<MultiSelectOption>,
  index: number,
  direction: 1 | -1,
): number {
  for (let next = index + direction; next >= 0 && next < options.length; next += direction) {
    if (!options[next].disabled) {
      return next;
    }
  }

  return -1;
}

function firstEnabledIndex(options: ReadonlyArray<MultiSelectOption>): number {
  return nextEnabledIndex(options, -1, 1);
}

type MultiSelectKeyPressEvent = TextInputKeyPressEvent & {
  preventDefault?: () => void;
};

export function MultiSelectCombobox({
  createOptionLabel,
  disabled = false,
  emptyMessage = '일치하는 항목이 없습니다.',
  onCreateOption,
  onQueryChange,
  onSelectedOptionsChange,
  options,
  placeholder = '검색어를 입력하세요',
  query,
  searchLabel,
  selectedLabel,
  selectedOptions,
}: MultiSelectComboboxProps): ReactNode {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rawListboxId = useId();
  const listboxId = `multi-select-listbox-${rawListboxId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const selectedValues = new Set(selectedOptions.map((option) => option.value));
  const canCreate = Boolean(onCreateOption && query.trim() && options.length === 0);
  const currentCreateLabel = createOptionLabel ?? `${query} 추가`;
  const rows = useMemo(
    () => (canCreate ? [...options, { label: currentCreateLabel, value: '__create__' }] : options),
    [canCreate, currentCreateLabel, options],
  );
  const previousQueryRef = useRef(query);
  const previousRowsRef = useRef(rows);
  const activeOption = activeIndex >= 0 ? rows[activeIndex] : undefined;
  const activeDescendant =
    open && activeOption && !activeOption.disabled
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== undefined) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const resultsChanged = previousQueryRef.current !== query || previousRowsRef.current !== rows;
    previousQueryRef.current = query;
    previousRowsRef.current = rows;
    setActiveIndex((current) => {
      if (!open) {
        return -1;
      }
      if (!resultsChanged && current >= 0 && current < rows.length && !rows[current]?.disabled) {
        return current;
      }
      return firstEnabledIndex(rows);
    });
  }, [canCreate, open, options, query, rows]);

  const close = () => {
    if (closeTimerRef.current !== undefined) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    setOpen(false);
    setActiveIndex(-1);
  };

  const deferClose = () => {
    if (closeTimerRef.current !== undefined) {
      clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = setTimeout(close, 0);
  };

  const selectOption = (option: MultiSelectOption) => {
    if (disabled || option.disabled) {
      return;
    }

    const next = selectedValues.has(option.value)
      ? selectedOptions.filter((selected) => selected.value !== option.value)
      : [...selectedOptions, option];
    onSelectedOptionsChange(next);
    close();
  };

  const removeOption = (value: string) => {
    if (disabled) {
      return;
    }

    onSelectedOptionsChange(selectedOptions.filter((option) => option.value !== value));
  };

  const createOption = () => {
    if (!disabled && canCreate) {
      onCreateOption?.(query);
      close();
    }
  };

  const activateCurrent = () => {
    if (disabled || !open) {
      return;
    }

    if (activeIndex >= 0 && activeIndex < options.length && options[activeIndex]) {
      selectOption(options[activeIndex]);
      return;
    }

    if (canCreate && activeIndex === options.length) {
      createOption();
    }
  };

  const handleKeyPress = (event: MultiSelectKeyPressEvent) => {
    const nativeEvent = event.nativeEvent as unknown as {
      isComposing?: boolean;
      key?: string;
    };
    const key = nativeEvent.key;

    if (key === 'Enter' && nativeEvent.isComposing) {
      return;
    }

    if (key === 'Escape') {
      event.preventDefault?.();
      close();
      return;
    }

    if (disabled) {
      return;
    }

    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault?.();
      setOpen(true);
      setActiveIndex((current) => {
        const direction = key === 'ArrowDown' ? 1 : -1;
        const start = current < 0 ? (direction === 1 ? -1 : rows.length) : current;
        return nextEnabledIndex(rows, start, direction);
      });
      return;
    }

    if (key === 'Enter' && Platform.OS === 'web') {
      event.preventDefault?.();
      activateCurrent();
    }
  };

  const inputWebProps: InputWebProps = {
    'aria-activedescendant': activeDescendant,
    'aria-autocomplete': 'list',
    'aria-controls': listboxId,
    'aria-disabled': disabled,
    'aria-expanded': open,
    role: 'combobox',
  };
  const inputProps = {
    ...inputWebProps,
    accessibilityLabel: searchLabel,
    accessibilityState: { disabled },
    editable: !disabled,
    onBlur: deferClose,
    onChangeText: (nextQuery: string) => {
      if (!disabled) {
        onQueryChange(nextQuery);
      }
    },
    onFocus: () => {
      if (!disabled) {
        if (closeTimerRef.current !== undefined) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = undefined;
        }
        setOpen(true);
        setActiveIndex(firstEnabledIndex(options));
      }
    },
    onKeyPress: handleKeyPress,
    onSubmitEditing: () => {
      if (Platform.OS !== 'web') {
        activateCurrent();
      }
    },
    placeholder,
    ref: inputRef,
    style: [styles.textFieldInput, { paddingRight: query.length > 0 ? space[48] : space[12] }],
    value: query,
  } as unknown as TextInputProps & InputWebProps;

  return (
    <View style={styles.root}>
      <Text style={[styles.selectedLabel, { color: theme.foregroundPrimary }]}>
        {selectedLabel}
      </Text>
      {selectedOptions.length > 0 ? (
        <View style={styles.chips}>
          {selectedOptions.map((option) => (
            <ProfileTagChip
              disabled={disabled}
              key={option.value}
              label={option.label}
              name={option.value}
              onRemove={() => removeOption(option.value)}
              removable
            />
          ))}
        </View>
      ) : null}
      <Text style={[styles.searchLabel, { color: theme.foregroundPrimary }]}>{searchLabel}</Text>
      <View style={styles.searchControl}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.searchIcon}
        >
          <Search
            color={disabled ? theme.stateDisabledForeground : theme.foregroundSecondary}
            size={iconSizes[20]}
            strokeWidth={2}
          />
        </View>
        <View style={styles.input}>
          <TextField {...inputProps} />
        </View>
        {query.length > 0 ? (
          <IconButton
            accessibilityLabel="검색어 지우기"
            disabled={disabled}
            onPress={() => {
              if (!disabled) {
                onQueryChange('');
                inputRef.current?.focus();
              }
            }}
            style={styles.clearButton}
          >
            <X
              color={disabled ? theme.stateDisabledForeground : theme.foregroundSecondary}
              size={iconSizes[20]}
              strokeWidth={2}
            />
          </IconButton>
        ) : null}
      </View>
      {open ? (
        <View
          style={[
            styles.surface,
            { backgroundColor: theme.backgroundElevated, borderColor: theme.borderDefault },
          ]}
        >
          {options.length === 0 ? (
            <Text style={[styles.emptyMessage, { color: theme.foregroundSecondary }]}>
              {emptyMessage}
            </Text>
          ) : null}
          <View
            accessibilityLabel={`${searchLabel} 결과`}
            accessibilityRole={'listbox' as never}
            nativeID={listboxId}
            style={styles.listbox}
            {...({ role: 'listbox' } as unknown as { role?: never })}
          >
            {options.map((option, index) => (
              <ListboxOption
                active={index === activeIndex}
                disabled={disabled || Boolean(option.disabled)}
                key={option.value}
                label={option.label}
                nativeID={`${listboxId}-option-${index}`}
                onSelect={() => selectOption(option)}
                selected={selectedValues.has(option.value)}
              />
            ))}
            {canCreate ? (
              <ListboxOption
                active={activeIndex === options.length}
                disabled={disabled}
                label={currentCreateLabel}
                nativeID={`${listboxId}-option-${options.length}`}
                onSelect={createOption}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[8],
  },
  clearButton: {
    position: 'absolute',
    right: 0,
    top: (44 - ICON_BUTTON_TARGET_SIZE) / 2,
  },
  emptyMessage: {
    padding: space[12],
    ...textStyles.uiCopyM,
  },
  input: {
    minWidth: 0,
    width: '100%',
  },
  listbox: {
    gap: space[4],
  },
  searchControl: {
    position: 'relative',
    width: '100%',
  },
  root: {
    gap: space[8],
    width: '100%',
  },
  searchIcon: {
    left: space[12],
    position: 'absolute',
    top: space[12],
    zIndex: 1,
  },
  searchLabel: textStyles.uiLabelM,
  surface: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    gap: space[4],
    padding: space[8],
  },
  selectedLabel: textStyles.uiLabelM,
  textFieldInput: {
    paddingLeft: space[48],
  },
});
