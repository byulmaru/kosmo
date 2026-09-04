import { useState } from 'react';
import { View } from 'react-native';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { ListboxOption } from '@/components/ui/ListboxOption';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ListboxOptionProps } from '@/components/ui/ListboxOption';

function ListboxOptionCatalog({
  active = false,
  description = '계정에 표시할 이름을 선택하세요.',
  disabled = false,
  label = '공개 이름',
  onSelect,
  selected = false,
}: ListboxOptionProps) {
  const [currentSelected, setCurrentSelected] = useState(selected);

  return (
    <View
      accessibilityLabel="공개 이름 옵션"
      style={{ maxWidth: 480, padding: 16, width: '100%' }}
      {...({ role: 'listbox' } as unknown as { role?: never })}
    >
      <ListboxOption
        active={active}
        description={description}
        disabled={disabled}
        label={label}
        onSelect={() => {
          setCurrentSelected(true);
          onSelect();
        }}
        selected={currentSelected}
      />
    </View>
  );
}

const meta = {
  args: {
    active: false,
    description: '계정에 표시할 이름을 선택하세요.',
    disabled: false,
    label: '공개 이름',
    onSelect: fn(),
    selected: false,
  },
  component: ListboxOption,
  excludeStories: [
    'DisabledSelectionContract',
    'EnabledSelectionContract',
    'ReducedMotionContract',
  ],
  parameters: { controls: { disable: true } },
  render: (args) => <ListboxOptionCatalog {...args} />,
  title: 'KOSMO/Components/Listbox Option',
} satisfies Meta<typeof ListboxOption>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  argTypes: {
    active: { control: 'boolean' },
    description: { control: 'text' },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
    onSelect: { control: false },
    selected: { control: 'boolean' },
  },
  parameters: {
    controls: {
      disable: false,
      include: ['active', 'description', 'disabled', 'label', 'selected'],
    },
  },
  render: (args) => (
    <ListboxOptionCatalog
      key={`${args.active}:${args.description}:${args.disabled}:${args.label}:${args.selected}`}
      {...args}
    />
  ),
};

export const EnabledSelectionContract: Story = {
  ...Playground,
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onSelect.mockClear();
    const option = within(canvasElement).getByRole('option', {
      name: `${args.label}: ${args.description}`,
    });

    expect(option).toHaveAttribute('aria-selected', 'false');
    await userEvent.click(option);
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(args.onSelect).toHaveBeenCalledOnce();
  },
};

export const DisabledSelectionContract: Story = {
  ...Playground,
  args: { disabled: true },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    args.onSelect.mockClear();
    const option = within(canvasElement).getByRole('option', {
      name: `${args.label}: ${args.description}`,
    });

    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveAttribute('aria-selected', 'false');
    await fireEvent.click(option);
    expect(option).toHaveAttribute('aria-selected', 'false');
    expect(args.onSelect).not.toHaveBeenCalled();
  },
};

export const ReducedMotionContract: Story = {
  ...Playground,
  globals: { reduceMotion: true },
  parameters: { controls: { disable: true } },
  play: async ({ args, canvasElement }) => {
    const option = within(canvasElement).getByRole('option', {
      name: `${args.label}: ${args.description}`,
    });
    expect(getComputedStyle(option).transitionDuration).toBe('0s');
  },
};

export const VisualStates: Story = {
  render: () => (
    <View
      accessibilityLabel="옵션 시각 상태"
      style={{ gap: 8, maxWidth: 480, padding: 16, width: '100%' }}
      {...({ role: 'listbox' } as unknown as { role?: never })}
    >
      <ListboxOption label="기본" onSelect={() => undefined} />
      <ListboxOption active label="활성" onSelect={() => undefined} />
      <ListboxOption description="현재 선택됨" label="선택됨" onSelect={() => undefined} selected />
      <ListboxOption disabled label="비활성" onSelect={() => undefined} />
      <ListboxOption
        description="여러 줄로 줄바꿈되어도 옵션의 의미와 선택 영역을 유지하는 설명입니다."
        label="분산형 소셜 네트워크에서 사용하는 이름이 아주 긴 태그 옵션"
        onSelect={() => undefined}
      />
    </View>
  ),
};
