import { useState } from 'react';
import { View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
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
  argTypes: {
    active: { control: 'boolean' },
    description: { control: 'text' },
    disabled: { control: 'boolean' },
    label: { control: 'text' },
    selected: { control: 'boolean' },
  },
  component: ListboxOption,
  parameters: { controls: { disable: true } },
  render: (args) => <ListboxOptionCatalog {...args} />,
  title: 'KOSMO/Components/Listbox Option',
} satisfies Meta<typeof ListboxOption>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
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
  play: async ({ args, canvasElement, step }) => {
    args.onSelect?.mockClear();
    const canvas = within(canvasElement);
    const name = args.description
      ? `${args.label ?? '공개 이름'}: ${args.description}`
      : (args.label ?? '공개 이름');
    const option = canvas.getByRole('option', { name });

    await step('옵션 상태와 접근성 확인', async () => {
      expect(option).toHaveAttribute('aria-selected', String(Boolean(args.selected)));
      if (args.disabled) {
        expect(option).toHaveAttribute('aria-disabled', 'true');
      } else {
        expect(option).not.toHaveAttribute('aria-disabled');
      }
      expect(option).toHaveAttribute('tabindex', '-1');
      expect(option).toBeVisible();
    });

    if (args.disabled) {
      return;
    }

    await step('옵션 선택과 Action 확인', async () => {
      await userEvent.click(option);
      expect(option).toHaveAttribute('aria-selected', 'true');
      expect(args.onSelect).toHaveBeenCalledOnce();
    });
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
    </View>
  ),
};
