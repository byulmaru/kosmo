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
  { label: '마스토돈', value: 'mastodon' },
  { label: '블루스카이', value: 'bluesky' },
  { label: '마이크로블로그', value: 'microblog' },
  { label: '마이크로포스트', value: 'micropost' },
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
    emptyMessage: '일치하는 태그가 없습니다.',
    onCreateOption: fn(),
    onQueryChange: fn(),
    onSelectedOptionsChange: fn(),
    options: catalogOptions,
    placeholder: '태그를 검색하세요',
    query: '',
    searchLabel: '태그 검색',
    selectedLabel: '선택된 태그',
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
    disabled: { control: 'boolean' },
    emptyMessage: { control: 'text' },
    options: {
      control: 'object',
      description: '검색 결과에 표시할 전체 태그입니다.',
    },
    placeholder: { control: 'text' },
    query: { control: 'text', description: '현재 검색어입니다.' },
    searchLabel: { control: 'text' },
    selectedLabel: { control: 'text' },
    selectedOptions: {
      control: 'object',
      description: 'options의 value와 일치하면 선택 상태로 표시되는 태그입니다.',
    },
  },
  parameters: {
    controls: {
      disable: false,
      include: [
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
      await userEvent.type(input, '블루');
      expect(args.onQueryChange).toHaveBeenLastCalledWith('블루');
      await userEvent.click(canvas.getByRole('button', { name: '검색어 지우기' }));
      expect(args.onQueryChange).toHaveBeenLastCalledWith('');
    });

    await step('Enter로 새 태그를 선택', async () => {
      await userEvent.click(input);
      await userEvent.keyboard('{ArrowDown}');
      const option = canvas.getByRole('option', { name: '블루스카이' });
      expect(option).toHaveAttribute('aria-selected', 'false');
      await userEvent.keyboard('{Enter}');
      expect(args.onSelectedOptionsChange).toHaveBeenLastCalledWith([
        catalogOptions[0],
        catalogOptions[1],
      ]);
    });

    await step('방금 선택한 chip 제거 Action 확인', async () => {
      await userEvent.click(canvas.getByRole('button', { name: '블루스카이 제거' }));
      expect(args.onSelectedOptionsChange).toHaveBeenLastCalledWith([catalogOptions[0]]);
    });

    await step('현재 검색어 생성 Action 확인', async () => {
      await userEvent.click(canvas.getByText(args.selectedLabel));
      await userEvent.click(input);
      await userEvent.clear(input);
      await userEvent.type(input, '새 태그');
      await userEvent.click(canvas.getByRole('option', { name: '새 태그 추가' }));
      expect(args.onCreateOption).toHaveBeenLastCalledWith('새 태그');
      await userEvent.click(canvas.getByRole('button', { name: '검색어 지우기' }));
      expect(args.onQueryChange).toHaveBeenLastCalledWith('');
    });

    await step('Playground를 초기 controlled 상태로 복구', async () => {
      expect(input).toHaveValue('');
      expect(canvas.getByRole('button', { name: '마스토돈 제거' })).toBeVisible();
      expect(canvas.queryByRole('button', { name: '블루스카이 제거' })).not.toBeInTheDocument();
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
        selectedOptions={[catalogOptions[0], catalogOptions[1]]}
      />
      <MultiSelectStory {...args} options={[]} query="새 태그" selectedOptions={[]} />
      <MultiSelectStory
        {...args}
        options={[
          {
            label: '분산형 소셜 네트워크에서 사용하는 이름이 아주 긴 태그 예시',
            value: 'long',
          },
        ]}
        query=""
        selectedOptions={[
          {
            label: '분산형 소셜 네트워크에서 사용하는 이름이 아주 긴 태그 예시',
            value: 'long',
          },
        ]}
      />
      <MultiSelectStory {...args} disabled options={catalogOptions} query="" selectedOptions={[]} />
    </View>
  ),
};

const styles = StyleSheet.create({
  catalog: { gap: space[24], maxWidth: 560, padding: space[16] },
  frame: { maxWidth: 560, padding: space[16], width: '100%' },
});
