import { RadioGroup, RadioOption } from '@/components/ui/RadioGroup';
import type { RadioOption as RadioOptionConfig } from '@/components/ui/RadioGroup';

export type ThemePreference = 'system' | 'light' | 'dark';

const options = [
  { label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
] as const satisfies readonly RadioOptionConfig<ThemePreference>[];

type ThemeSelectionProps = {
  disabled?: boolean;
  onChange: (value: ThemePreference) => void;
  value: ThemePreference;
};

export function ThemeSelection({ disabled = false, onChange, value }: ThemeSelectionProps) {
  return (
    <RadioGroup
      accessibilityLabel="테마 선택"
      disabled={disabled}
      onChange={onChange}
      value={value}
    >
      {options.map((option) => (
        <RadioOption key={option.value} option={option} />
      ))}
    </RadioGroup>
  );
}
