import { useEffect, useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type {
  FullReactionPickerOption,
  FullReactionPickerProps,
} from '@/components/reaction/FullReactionPicker';

export const reactionOptions: readonly FullReactionPickerOption[] = [
  {
    category: 'expressions',
    categoryLabel: '표정과 감정',
    emoji: '🥹',
    id: 'moved',
    keywords: ['감동', '눈물'],
    label: '감동',
    quick: true,
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '❤️',
    id: 'heart-red',
    keywords: ['하트', '사랑'],
    label: '빨간 하트',
    quick: true,
    recent: true,
  },
  {
    category: 'activities',
    categoryLabel: '활동',
    emoji: '🎉',
    id: 'party',
    keywords: ['축하'],
    label: '축하',
    quick: true,
  },
  {
    category: 'expressions',
    categoryLabel: '표정과 감정',
    emoji: '👀',
    id: 'eyes',
    keywords: ['눈', '보기'],
    label: '지켜보기',
    quick: true,
  },
  {
    category: 'nature',
    categoryLabel: '동물과 자연',
    emoji: '☘️',
    id: 'clover',
    keywords: ['행운', '클로버'],
    label: '행운',
    quick: true,
  },
  {
    category: 'nature',
    categoryLabel: '동물과 자연',
    emoji: '🌈',
    id: 'rainbow',
    keywords: ['무지개'],
    label: '무지개',
    quick: true,
  },
  {
    category: 'expressions',
    categoryLabel: '표정과 감정',
    emoji: '😂',
    id: 'laugh',
    keywords: ['웃음'],
    label: '웃음',
    recent: true,
  },
  {
    category: 'nature',
    categoryLabel: '동물과 자연',
    emoji: '🔥',
    id: 'fire',
    keywords: ['불꽃'],
    label: '불꽃',
    recent: true,
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '👏',
    id: 'clap',
    keywords: ['박수'],
    label: '박수',
    recent: true,
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '✨',
    id: 'sparkles',
    keywords: ['반짝임'],
    label: '반짝임',
    recent: true,
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💯',
    id: 'hundred',
    keywords: ['최고'],
    label: '최고',
    recent: true,
  },
  {
    category: 'expressions',
    categoryLabel: '표정과 감정',
    emoji: '😍',
    id: 'heart-eyes',
    keywords: ['하트', '사랑'],
    label: '하트 눈',
    recent: true,
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '🩷',
    id: 'heart-pink',
    keywords: ['하트'],
    label: '분홍 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '🧡',
    id: 'heart-orange',
    keywords: ['하트'],
    label: '주황 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💛',
    id: 'heart-yellow',
    keywords: ['하트'],
    label: '노란 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💚',
    id: 'heart-green',
    keywords: ['하트'],
    label: '초록 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💙',
    id: 'heart-blue',
    keywords: ['하트'],
    label: '파란 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💜',
    id: 'heart-purple',
    keywords: ['하트'],
    label: '보라 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '🤎',
    id: 'heart-brown',
    keywords: ['하트'],
    label: '갈색 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '🖤',
    id: 'heart-black',
    keywords: ['하트'],
    label: '검정 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '🤍',
    id: 'heart-white',
    keywords: ['하트'],
    label: '하얀 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '🩶',
    id: 'heart-gray',
    keywords: ['하트'],
    label: '회색 하트',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💔',
    id: 'heart-broken',
    keywords: ['하트'],
    label: '깨진 하트',
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '👋',
    id: 'wave',
    keywords: ['인사'],
    label: '손 흔들기',
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '🤚',
    id: 'raised-back-hand',
    keywords: ['손'],
    label: '손등 들기',
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '🖐️',
    id: 'hand',
    keywords: ['손'],
    label: '손바닥',
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '🖖',
    id: 'vulcan',
    keywords: ['인사'],
    label: '벌컨 인사',
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '🫶',
    id: 'heart-hands',
    keywords: ['하트', '손'],
    label: '하트 손',
  },
];

const meta = {
  args: {
    activeCategory: 'expressions',
    onCategoryChange: fn(),
    onQueryChange: fn(),
    onSelect: fn(),
    options: reactionOptions,
    presentation: 'web',
    query: '',
    selectedValues: [],
    loading: false,
  },
  argTypes: {
    activeCategory: {
      control: 'select',
      options: ['expressions', 'gestures', 'nature', 'activities', 'symbols'],
    },
    onCategoryChange: { action: 'categoryChange', control: false },
    onQueryChange: { action: 'queryChange', control: false },
    onSelect: { action: 'select', control: false },
    options: { control: 'object' },
    presentation: { control: 'inline-radio', options: ['web', 'mobile'] },
    query: { control: 'text' },
    selectedValues: { control: 'object' },
    loading: { control: 'boolean' },
  },
  component: FullReactionPicker,
  excludeStories: [
    'InteractionContract',
    'LoadingContract',
    'MobileBrowseGeometryContract',
    'MobileExpandedGeometryContract',
    'reactionOptions',
  ],
  parameters: { layout: 'centered' },
  title: 'KOSMO/Components/Full Reaction Picker',
} satisfies Meta<typeof FullReactionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: (args) => <InteractivePicker {...args} /> };
export const WebBrowse: Story = {};
export const WebSearchResults: Story = { args: { query: '하트' } };
export const WebEmpty: Story = { args: { query: '존재하지않음' } };
export const WebLoading: Story = { args: { loading: true } };

const mobileGlobals = { viewport: { isRotated: false, value: 'kosmoMobile' } } as const;
const mobileParameters = { layout: 'fullscreen' } as const;

export const MobileBrowse: Story = {
  args: { presentation: 'mobile' },
  globals: mobileGlobals,
  parameters: mobileParameters,
};
export const MobileScrolled: Story = {
  ...MobileBrowse,
  play: async ({ canvasElement }) => {
    const scroll = within(canvasElement).getByTestId('full-reaction-picker-scroll');
    (
      scroll as HTMLElement & {
        scrollTo(options: { animated: boolean; y: number }): void;
      }
    ).scrollTo({ animated: false, y: 160 });
    expect(scroll.scrollTop).toBeGreaterThan(0);
  },
};
export const MobileSearchResults: Story = {
  args: { presentation: 'mobile', query: '하트' },
  globals: mobileGlobals,
  parameters: mobileParameters,
};
export const MobileEmpty: Story = {
  args: { presentation: 'mobile', query: '존재하지않음' },
  globals: mobileGlobals,
  parameters: mobileParameters,
};
export const MobileLoading: Story = {
  args: { presentation: 'mobile', loading: true },
  globals: mobileGlobals,
  parameters: mobileParameters,
};

function InteractivePicker(props: FullReactionPickerProps) {
  const [activeCategory, setActiveCategory] = useState(props.activeCategory);
  const [query, setQuery] = useState(props.query);
  const [selectedValues, setSelectedValues] = useState(props.selectedValues ?? []);

  useEffect(() => setActiveCategory(props.activeCategory), [props.activeCategory]);
  useEffect(() => setQuery(props.query), [props.query]);
  useEffect(() => setSelectedValues(props.selectedValues ?? []), [props.selectedValues]);

  return (
    <FullReactionPicker
      {...props}
      activeCategory={activeCategory}
      onCategoryChange={(category) => {
        props.onCategoryChange(category);
        setActiveCategory(category);
      }}
      onQueryChange={(value) => {
        props.onQueryChange(value);
        setQuery(value);
      }}
      onSelect={(option) => {
        props.onSelect(option);
        setSelectedValues((values) =>
          values.includes(option.id)
            ? values.filter((value) => value !== option.id)
            : [...values, option.id],
        );
      }}
      query={query}
      selectedValues={selectedValues}
    />
  );
}

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onCategoryChange.mockClear();
    args.onQueryChange.mockClear();
    args.onSelect.mockClear();
    const canvas = within(canvasElement);
    const search = canvas.getByRole('searchbox', { name: '반응 검색' });

    expect(canvas.getByRole('dialog', { name: '반응 선택' })).toHaveStyle({
      height: '624px',
      width: '360px',
    });
    expect(canvas.getByText('빠른 반응')).toBeVisible();
    expect(canvas.getByText('최근 사용')).toBeVisible();

    await userEvent.click(canvas.getByRole('button', { name: '사람과 몸짓 category 보기' }));
    expect(args.onCategoryChange).toHaveBeenLastCalledWith('gestures');

    await userEvent.click(canvas.getAllByRole('button', { name: '빨간 하트 ❤️' })[0]);
    expect(args.onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ emoji: '❤️', id: 'heart-red' }),
    );

    await userEvent.type(search, '하트');
    expect(args.onQueryChange).toHaveBeenLastCalledWith('하트');
    expect(canvas.getByText('‘하트’ 검색 결과 14개')).toBeVisible();
    expect(canvas.getByText('반응')).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, '❤️');
    expect(canvas.getByRole('button', { name: '빨간 하트 ❤️' })).toBeVisible();

    await userEvent.clear(search);
    await userEvent.type(search, '존재하지않음');
    expect(canvas.getByText('검색 결과가 없어요')).toBeVisible();
    expect(canvas.getByText('다른 이름이나 이모지로 검색해 보세요.')).toBeVisible();
  },
  render: (args) => <InteractivePicker {...args} />,
};

export const LoadingContract: Story = {
  args: { loading: true },
  globals: { reduceMotion: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByLabelText('반응을 불러오는 중')).toHaveAttribute('aria-busy', 'true');
    expect(canvas.getByText('···')).toBeVisible();
  },
};

export const MobileBrowseGeometryContract: Story = {
  ...MobileBrowse,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByTestId('full-reaction-picker-sheet')).toHaveStyle({
      height: '480px',
    });
  },
};

export const MobileExpandedGeometryContract: Story = {
  ...MobileSearchResults,
  play: async ({ canvasElement }) => {
    expect(within(canvasElement).getByTestId('full-reaction-picker-sheet')).toHaveStyle({
      height: '720px',
    });
  },
};
