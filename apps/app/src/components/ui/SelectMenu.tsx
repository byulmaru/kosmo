import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, spacing, typography } from '@/theme/tokens';
import { Button } from './Button';
import { ModalSheet } from './ModalSheet';

type Option<Value extends string> = {
  description?: string;
  label: string;
  value: Value;
};

type Props<Value extends string> = {
  label: string;
  onChange: (value: Value) => void;
  options: ReadonlyArray<Option<Value>>;
  value: Value;
};

export function SelectMenu<Value extends string>({
  label,
  onChange,
  options,
  value,
}: Props<Value>) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <>
      <Button onPress={() => setOpen(true)} tone="secondary">
        {selected?.label ?? label}
      </Button>
      <ModalSheet onClose={() => setOpen(false)} title={label} visible={open}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              aria-checked={active}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={[styles.option, { backgroundColor: active ? theme.surface : 'transparent' }]}
            >
              <Text style={[styles.label, { color: theme.text }]}>{option.label}</Text>
              {option.description ? (
                <Text style={[styles.description, { color: theme.textSecondary }]}>
                  {option.description}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  option: { borderRadius: radii.md, gap: spacing.xs, padding: spacing.md },
  label: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  description: { fontFamily: 'SUIT', ...typography.sm },
});
