import { useState } from 'react';
import { View } from 'react-native';
import { fn } from 'storybook/test';
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
  parameters: { controls: { disable: true } },
  render: (args) => <ListboxOptionCatalog {...args} />,
  title: 'KOSMO/Components/Listbox Option',
} satisfies Meta<typeof ListboxOption>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

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
