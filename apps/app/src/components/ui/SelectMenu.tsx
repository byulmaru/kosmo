import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, radius, space, textStyles } from '@/theme/tokens';
import { Button } from './Button';
import { ModalSheet } from './ModalSheet';
import { RadioGroup, RadioOption } from './RadioGroup';

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
        <RadioGroup
          accessibilityLabel={label}
          onChange={(nextValue) => {
            onChange(nextValue);
            setOpen(false);
          }}
          options={options}
          value={value}
        >
          {options.map((option) => {
            const active = option.value === value;
            return (
              <RadioOption
                key={option.value}
                option={option}
                style={[
                  styles.option,
                  {
                    backgroundColor: active ? theme.stateSelectedSurface : 'transparent',
                    borderColor: active ? theme.stateSelectedBorder : 'transparent',
                  },
                ]}
              >
                <Text style={[styles.label, { color: theme.foregroundPrimary }]}>
                  {option.label}
                </Text>
                {option.description ? (
                  <Text style={[styles.description, { color: theme.foregroundSecondary }]}>
                    {option.description}
                  </Text>
                ) : null}
              </RadioOption>
            );
          })}
        </RadioGroup>
      </ModalSheet>
    </>
  );
}

const styles = StyleSheet.create({
  option: {
    borderRadius: radius[12],
    borderWidth: borderWidths[1],
    gap: space[4],
    padding: space[12],
  },
  label: textStyles.uiLabelL,
  description: textStyles.uiCopyM,
});
