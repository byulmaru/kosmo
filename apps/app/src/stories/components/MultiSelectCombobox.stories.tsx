import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MultiSelectCombobox } from '@/components/ui/MultiSelectCombobox';
import { space } from '@/theme/tokens';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  MultiSelectComboboxProps,
  MultiSelectOption,
} from '@/components/ui/MultiSelectCombobox';

const catalogOptions: MultiSelectOption[] = [
  { label: '공개 이름', value: 'display-name' },
  { disabled: true, label: '사용 중지된 설정', value: 'disabled' },
  { label: '프로필 소개', value: 'bio' },
];

type StoryArgs = MultiSelectComboboxProps;

function MultiSelectStory(args: StoryArgs) {
  const [query, setQuery] = useState(args.query);
  const [selectedOptions, setSelectedOptions] = useState(args.selectedOptions);
  useEffect(() => setQuery(args.query), [args.query]);
  useEffect(() => setSelectedOptions(args.selectedOptions), [args.selectedOptions]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const options = normalizedQuery
    ? args.options.filter((option) => option.label.toLocaleLowerCase().includes(normalizedQuery))
    : args.options;

  return (
    <View style={styles.frame}>
      <MultiSelectCombobox
        {...args}
        onCreateOption={(nextQuery) => {
          args.onCreateOption?.(nextQuery);
        }}
        onQueryChange={(nextQuery) => {
          setQuery(nextQuery);
          args.onQueryChange(nextQuery);
        }}
        onSelectedOptionsChange={(nextOptions) => {
          setSelectedOptions(nextOptions);
          args.onSelectedOptionsChange(nextOptions);
        }}
        options={options}
        query={query}
        selectedOptions={selectedOptions}
      />
    </View>
  );
}

const meta = {
  args: {
    createOptionLabel: '새 항목 추가',
    emptyMessage: '일치하는 항목이 없습니다.',
    onCreateOption: fn(),
    onQueryChange: fn(),
    onSelectedOptionsChange: fn(),
    options: catalogOptions,
    placeholder: '설정을 검색하세요',
    query: '',
    searchLabel: '설정 검색',
    selectedLabel: '선택된 설정',
    selectedOptions: [catalogOptions[0]],
  },
  component: MultiSelectCombobox,
  parameters: { controls: { disable: true } },
  render: (args) => <MultiSelectStory {...args} />,
  title: 'KOSMO/Components/Multi Select Combobox',
} satisfies Meta<StoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Playground: Story = {
  args: {
    disabled: false,
    query: '',
  },
  argTypes: {
    createOptionLabel: { control: 'text' },
    disabled: { control: 'boolean' },
    emptyMessage: { control: 'text' },
    options: { control: 'object' },
    placeholder: { control: 'text' },
    query: { control: 'text' },
    searchLabel: { control: 'text' },
    selectedLabel: { control: 'text' },
    selectedOptions: { control: 'object' },
  },
  parameters: {
    controls: {
      disable: false,
      include: [
        'createOptionLabel',
        'disabled',
        'emptyMessage',
        'options',
        'placeholder',
        'query',
        'searchLabel',
        'selectedLabel',
        'selectedOptions',
      ],
    },
  },
  play: async ({ args, canvasElement, step }) => {
    args.onCreateOption?.mockClear();
    args.onQueryChange.mockClear();
    args.onSelectedOptionsChange.mockClear();
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox', { name: args.searchLabel });

    if (args.disabled) {
      await step('비활성 상태와 접근성 확인', async () => {
        expect(input).toHaveAttribute('aria-disabled', 'true');
        expect(input).toHaveAttribute('readonly');
      });
      return;
    }

    await step('포커스 시 listbox와 active descendant 확인', async () => {
      await userEvent.click(input);
      expect(input).toHaveAttribute('aria-expanded', 'true');
      expect(input).toHaveAttribute('aria-controls');
      expect(canvas.getByRole('listbox', { name: `${args.searchLabel} 결과` })).toBeVisible();
    });

    await step('검색어 변경과 clear Action 확인', async () => {
      await userEvent.clear(input);
      await userEvent.type(input, '공개');
      expect(args.onQueryChange).toHaveBeenLastCalledWith('공개');
      await userEvent.click(canvas.getByRole('button', { name: '검색어 지우기' }));
      expect(args.onQueryChange).toHaveBeenLastCalledWith('');
    });

    await step('비활성 옵션을 건너뛰고 Enter로 선택', async () => {
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');
      const option = canvas.getByRole('option', { name: '프로필 소개' });
      expect(option).toHaveAttribute('aria-selected', 'false');
      await userEvent.keyboard('{Enter}');
      expect(args.onSelectedOptionsChange).toHaveBeenCalled();
    });

    await step('선택 chip 제거 Action 확인', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '공개 이름 제거' }));
      expect(args.onSelectedOptionsChange).toHaveBeenCalled();
    });

    await step('현재 검색어 생성 Action 확인', async () => {
      await userEvent.click(canvas.getByText(args.selectedLabel));
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '새 항목');
      await userEvent.click(canvas.getByRole('option', { name: '새 항목 추가' }));
      expect(args.onCreateOption).toHaveBeenLastCalledWith('새 항목');
    });
  },
};

export const RepresentativeStates: Story = {
  render: (args) => (
    <View style={styles.catalog}>
      <MultiSelectStory
        {...args}
        options={catalogOptions}
        query=""
        selectedOptions={[catalogOptions[0], catalogOptions[2]]}
      />
      <MultiSelectStory {...args} options={[]} query="새 항목" selectedOptions={[]} />
      <MultiSelectStory
        {...args}
        options={[{ label: '이름이 아주 긴 설정 항목을 표시하는 예시', value: 'long' }]}
        query=""
        selectedOptions={[{ label: '이름이 아주 긴 설정 항목을 표시하는 예시', value: 'long' }]}
      />
      <MultiSelectStory {...args} disabled options={catalogOptions} query="" selectedOptions={[]} />
    </View>
  ),
};

const styles = StyleSheet.create({
  catalog: { gap: space[24], maxWidth: 560, padding: space[16] },
  frame: { maxWidth: 560, padding: space[16], width: '100%' },
});
