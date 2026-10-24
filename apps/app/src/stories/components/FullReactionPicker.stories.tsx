import { useEffect, useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { FullReactionPicker } from '@/components/reaction/FullReactionPicker';
import { reactionEmojiPickerOptions } from '@/components/reaction/reactionEmojiCatalog';
import { ModalOverlay } from '@/components/ui/ModalOverlay';
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
  },
  {
    category: 'nature',
    categoryLabel: '동물과 자연',
    emoji: '🔥',
    id: 'fire',
    keywords: ['불꽃'],
    label: '불꽃',
  },
  {
    category: 'gestures',
    categoryLabel: '사람과 몸짓',
    emoji: '👏',
    id: 'clap',
    keywords: ['박수'],
    label: '박수',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '✨',
    id: 'sparkles',
    keywords: ['반짝임'],
    label: '반짝임',
  },
  {
    category: 'symbols',
    categoryLabel: '기호',
    emoji: '💯',
    id: 'hundred',
    keywords: ['최고'],
    label: '최고',
  },
  {
    category: 'expressions',
    categoryLabel: '표정과 감정',
    emoji: '😍',
    id: 'heart-eyes',
    keywords: ['하트', '사랑'],
    label: '하트 눈',
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
    onClose: fn(),
    onQueryChange: fn(),
    onSelect: fn(),
    options: reactionOptions,
    presentation: 'web',
    query: '',
    recentValues: [],
    selectedValues: [],
    loading: false,
  },
  argTypes: {
    onClose: { action: 'close', control: false },
    onQueryChange: { action: 'queryChange', control: false },
    onSelect: { action: 'select', control: false },
    options: { control: 'object' },
    presentation: { control: 'inline-radio', options: ['web', 'mobile'] },
    query: { control: 'text' },
    selectedValues: { control: 'object' },
    recentValues: { control: 'object' },
    loading: { control: 'boolean' },
  },
  component: FullReactionPicker,
  excludeStories: [
    'InteractionContract',
    'SearchScrollResetContract',
    'MobileWebSearchScrollResetContract',
    'LoadingContract',
    'MobileGridGeometryContract',
    'MobileBrowseGeometryContract',
    'MobileHandleExpansionContract',
    'MobileHandleRowTargetContract',
    'MobileExpandedGeometryContract',
    'MobileOverlayContract',
    'WebGridGeometryContract',
    'WebMobileGridGeometryContract',
    'RecentSectionContract',
    'RecentTwoRowsWebContract',
    'RecentTwoRowsMobileWebContract',
    'RecentTwoRowsNativeContract',
    'reactionOptions',
    'SequentialKeyboardBrowseContract',
    'WebExitInertEscapeContract',
  ],
  parameters: { layout: 'centered' },
  render: (args) => <StoryPicker {...args} />,
  title: 'KOSMO/Components/Full Reaction Picker',
} satisfies Meta<typeof FullReactionPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: (args) => <StoryPicker {...args} /> };
export const WebBrowse: Story = {};
export const WebSearchResults: Story = { args: { query: '하트' } };
export const WebEmpty: Story = { args: { query: '존재하지않음' } };
export const WebLoading: Story = { args: { loading: true } };
export const WebRecent: Story = { args: { recentValues: ['fire', 'laugh'] } };

export const WebExitInertEscapeContract: Story = {
  render: (args) => <ExitInertEscapeHarness {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const closeCount = canvas.getByTestId('full-reaction-picker-close-count');

    await userEvent.click(canvas.getByRole('button', { name: '종료 상태로 전환' }));
    await userEvent.keyboard('{Escape}');
    expect(closeCount).toHaveTextContent('0');

    await userEvent.click(canvas.getByRole('button', { name: '다시 열기' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(closeCount).toHaveTextContent('1'));
    expect(page.getByRole('dialog', { name: '반응 선택' })).toBeVisible();
  },
};

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
    const scroll = within(canvasElement.ownerDocument.body).getByTestId(
      'full-reaction-picker-scroll',
    );
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
export const MobileRecent: Story = {
  ...MobileBrowse,
  args: { presentation: 'mobile', recentValues: ['fire', 'laugh'] },
};

export const MobileOverlayContract: Story = {
  ...MobileBrowse,
  play: async ({ canvasElement }) => {
    const document = canvasElement.ownerDocument;
    const page = within(document.body);
    const overlay = await page.findByTestId('full-reaction-picker-modal');
    const backdrop = within(overlay).getByTestId('full-reaction-picker-backdrop-dismiss');
    const sheet = within(overlay).getByTestId('full-reaction-picker-sheet');
    const search = within(overlay).getByRole('searchbox', { name: '반응 검색' });
    const overlayBounds = overlay.getBoundingClientRect();
    const sheetBounds = sheet.getBoundingClientRect();

    expect(overlay).toBeVisible();
    expect(page.getAllByRole('dialog', { name: '반응 선택' })).toHaveLength(1);
    expect(sheetBounds.top).toBeGreaterThan(overlayBounds.top);
    const searchBounds = search.getBoundingClientRect();
    const insideHitTarget = document.elementFromPoint(
      searchBounds.left + searchBounds.width / 2,
      searchBounds.top + searchBounds.height / 2,
    );
    expect(insideHitTarget).not.toBeNull();
    expect(search.contains(insideHitTarget)).toBe(true);
    await userEvent.click(insideHitTarget as HTMLElement);
    expect(overlay).toBeVisible();

    const backdropHitTarget = document.elementFromPoint(
      overlayBounds.left + overlayBounds.width / 2,
      overlayBounds.top + (sheetBounds.top - overlayBounds.top) / 2,
    );
    expect(backdropHitTarget).not.toBeNull();
    expect(backdrop.contains(backdropHitTarget)).toBe(true);
    await userEvent.click(backdropHitTarget as HTMLElement);
    await waitFor(() => expect(overlay).not.toBeVisible());
  },
};

export const MobileGridGeometryContract: Story = {
  ...MobileBrowse,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const rows = canvas.getAllByTestId(/^full-reaction-section-symbols-row-/);
    const quickRow = canvas.getByTestId('full-reaction-section-quick-row-0');
    const symbolsHeading = canvas.getByRole('heading', { name: '기호' });
    const expressionsHeading = canvas.getByRole('heading', { name: '표정과 감정' });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(getComputedStyle(row).justifyContent).toBe('normal');
    }
    expect(
      rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().bottom,
    ).toBeCloseTo(0, 0);
    expect(
      rows[0]!.getBoundingClientRect().top - symbolsHeading.getBoundingClientRect().bottom,
    ).toBeCloseTo(8, 0);
    expect(
      expressionsHeading.getBoundingClientRect().top - quickRow.getBoundingClientRect().bottom,
    ).toBeCloseTo(16, 0);
    expectQuickColumnsToAlign(canvasElement);
  },
};

export const WebGridGeometryContract: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getAllByTestId(/^full-reaction-section-symbols-row-/);
    const quickRow = canvas.getByTestId('full-reaction-section-quick-row-0');
    const symbolsHeading = canvas.getByRole('heading', { name: '기호' });
    const expressionsHeading = canvas.getByRole('heading', { name: '표정과 감정' });
    expect(rows).toHaveLength(2);
    expect(getComputedStyle(rows[0]).justifyContent).toBe('space-between');
    expect(getComputedStyle(rows[1]).justifyContent).toBe('flex-start');
    expect(
      rows[1]!.getBoundingClientRect().top - rows[0]!.getBoundingClientRect().bottom,
    ).toBeCloseTo(8, 0);
    expect(
      rows[0]!.getBoundingClientRect().top - symbolsHeading.getBoundingClientRect().bottom,
    ).toBeCloseTo(8, 0);
    expect(
      expressionsHeading.getBoundingClientRect().top - quickRow.getBoundingClientRect().bottom,
    ).toBeCloseTo(16, 0);
    expectQuickColumnsToAlign(canvasElement);
  },
};

export const WebMobileGridGeometryContract: Story = {
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = canvas.getByRole('dialog', { name: '반응 선택' });
    expect(dialog.getBoundingClientRect().width).toBeLessThanOrEqual(288);
    expect(dialog.getBoundingClientRect().height).toBeLessThanOrEqual(420);
    const grid = within(canvas.getByTestId('full-reaction-section-symbols-row-0')).getAllByRole(
      'button',
    );
    expect(grid).toHaveLength(6);
    expectQuickColumnsToAlign(canvasElement);
  },
};

export const RecentSectionContract: Story = {
  args: { recentValues: ['fire', 'laugh'] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '최근 사용' })).toBeVisible();
    expect(canvas.getByTestId('full-reaction-section-recent-row-0')).toBeVisible();
    const recent = within(canvas.getByTestId('full-reaction-section-recent-row-0')).getAllByRole(
      'button',
    );
    expect(recent.map((button) => button.getAttribute('aria-label'))).toEqual([
      '불꽃 🔥',
      '웃음 😂',
    ]);
  },
};

const fullRecentValues = reactionOptions.map((option) => option.id);

export const RecentTwoRowsWebContract: Story = {
  args: { recentValues: fullRecentValues },
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByTestId(/^full-reaction-section-recent-row-/);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => within(row).getAllByRole('button').length)).toEqual([8, 8]);
  },
};

export const RecentTwoRowsMobileWebContract: Story = {
  args: { recentValues: fullRecentValues },
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByTestId(/^full-reaction-section-recent-row-/);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => within(row).getAllByRole('button').length)).toEqual([6, 6]);
  },
};

export const RecentTwoRowsNativeContract: Story = {
  ...MobileBrowse,
  args: { presentation: 'mobile', recentValues: fullRecentValues },
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement.ownerDocument.body).getAllByTestId(
      /^full-reaction-section-recent-row-/,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => within(row).getAllByRole('button').length)).toEqual([7, 7]);
  },
};

function expectQuickColumnsToAlign(canvasElement: HTMLElement) {
  const canvas = within(canvasElement.ownerDocument.body);
  const quick = within(canvas.getByTestId('full-reaction-section-quick-row-0')).getAllByRole(
    'button',
  );
  const grid = within(canvas.getByTestId('full-reaction-section-symbols-row-0')).getAllByRole(
    'button',
  );
  expect(quick).toHaveLength(6);
  for (let column = 0; column < quick.length; column += 1) {
    expect(
      Math.abs(
        quick[column].getBoundingClientRect().left - grid[column].getBoundingClientRect().left,
      ),
    ).toBeLessThan(1);
  }
}

function InteractivePicker(props: FullReactionPickerProps) {
  const [query, setQuery] = useState(props.query);
  const [selectedValues, setSelectedValues] = useState(props.selectedValues ?? []);

  useEffect(() => setQuery(props.query), [props.query]);
  useEffect(() => setSelectedValues(props.selectedValues ?? []), [props.selectedValues]);

  return (
    <FullReactionPicker
      {...props}
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

function StoryPicker(props: FullReactionPickerProps) {
  if (props.presentation !== 'mobile') {
    return <InteractivePicker {...props} />;
  }

  return <MobileStoryPicker {...props} />;
}

function MobileStoryPicker(props: FullReactionPickerProps) {
  const [visible, setVisible] = useState(true);
  const close = () => {
    props.onClose();
    setVisible(false);
  };

  return (
    <ModalOverlay
      accessibilityLabel="반응 선택"
      backdropTestID="full-reaction-picker-backdrop-dismiss"
      onRequestClose={close}
      presentation="sheet"
      testID="full-reaction-picker-modal"
      visible={visible}
    >
      <InteractivePicker {...props} onClose={close} />
    </ModalOverlay>
  );
}

function ExitInertEscapeHarness(props: FullReactionPickerProps) {
  const [exiting, setExiting] = useState(false);
  const [closeCount, setCloseCount] = useState(0);

  return (
    <>
      <button onClick={() => setExiting(true)}>종료 상태로 전환</button>
      <button onClick={() => setExiting(false)}>다시 열기</button>
      <div data-testid="full-reaction-picker-exit-owner" inert={exiting || undefined}>
        <FullReactionPicker
          {...props}
          onClose={() => {
            props.onClose();
            setCloseCount((count) => count + 1);
          }}
        />
      </div>
      <output data-testid="full-reaction-picker-close-count">{closeCount}</output>
    </>
  );
}

export const InteractionContract: Story = {
  play: async ({ args, canvasElement }) => {
    args.onQueryChange.mockClear();
    args.onSelect.mockClear();
    const canvas = within(canvasElement);
    const search = canvas.getByRole('searchbox', { name: '반응 검색' });

    expect(getComputedStyle(search).fontSize).toBe('16px');

    expect(canvas.getByRole('dialog', { name: '반응 선택' })).toHaveStyle({
      height: '624px',
      width: '360px',
    });
    expect(canvas.getByRole('heading', { name: '빠른 반응' })).toBeVisible();
    expect(canvas.getByRole('heading', { name: '표정과 감정' })).toBeVisible();
    expect(canvas.queryByRole('button', { name: /category 보기/ })).not.toBeInTheDocument();

    const heartButton = canvas.getAllByRole('button', { name: '빨간 하트 ❤️' })[0];
    const movedButton = canvas.getAllByRole('button', { name: '감동 🥹' })[0];
    const heartSurface = heartButton.firstElementChild!;
    const idleBackground = getComputedStyle(heartSurface).backgroundColor;
    await userEvent.hover(heartButton);
    await waitFor(() =>
      expect(getComputedStyle(heartSurface).backgroundColor).not.toBe(idleBackground),
    );
    await userEvent.unhover(heartButton);
    expect(within(heartButton).getByText('❤️')).toBeVisible();
    expect(heartButton).toHaveAttribute('aria-pressed', 'false');
    expect(movedButton).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(heartButton);
    expect(args.onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ emoji: '❤️', id: 'heart-red' }),
    );
    expect(heartButton).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(movedButton);
    expect(movedButton).toHaveAttribute('aria-pressed', 'true');
    expect(heartButton).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(heartButton);
    expect(heartButton).toHaveAttribute('aria-pressed', 'false');
    expect(movedButton).toHaveAttribute('aria-pressed', 'true');

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

export const SearchScrollResetContract: Story = {
  args: { options: reactionEmojiPickerOptions, selectedValues: ['❤️'] },
  render: (args) => <InteractivePicker {...args} />,
  play: async ({ args, canvasElement }) => {
    args.onQueryChange.mockClear();
    args.onSelect.mockClear();
    const canvas = within(canvasElement);
    const search = canvas.getByRole('searchbox', { name: '반응 검색' });
    await waitFor(() => expect(search).toHaveFocus());

    const browseScroll = canvas.getByTestId('full-reaction-picker-scroll') as HTMLElement;
    browseScroll.scroll({ top: browseScroll.scrollHeight, behavior: 'instant' });
    await waitFor(() => expect(browseScroll.scrollTop).toBeGreaterThan(0));

    await userEvent.type(search, 'a');
    expect(search).toHaveValue('a');
    expect(search).toHaveFocus();
    expect(args.onQueryChange).toHaveBeenLastCalledWith('a');

    let resultsScroll = canvas.getByTestId('full-reaction-picker-scroll') as HTMLElement;
    await waitFor(() => expect(resultsScroll.scrollTop).toBe(0));
    expect(resultsScroll.scrollHeight).toBeGreaterThan(resultsScroll.clientHeight);
    let firstResultRow = await within(resultsScroll).findByTestId(
      'full-reaction-section-results-row-0',
    );
    let listBounds = resultsScroll.getBoundingClientRect();
    let firstRowBounds = firstResultRow.getBoundingClientRect();
    expect(firstRowBounds.top).toBeGreaterThanOrEqual(listBounds.top);
    expect(firstRowBounds.bottom).toBeLessThanOrEqual(listBounds.bottom);

    resultsScroll.scroll({ top: resultsScroll.scrollHeight, behavior: 'instant' });
    await waitFor(() => expect(resultsScroll.scrollTop).toBeGreaterThan(0));
    await userEvent.type(search, 'n');
    expect(search).toHaveValue('an');
    expect(search).toHaveFocus();
    expect(args.onQueryChange).toHaveBeenLastCalledWith('an');

    resultsScroll = canvas.getByTestId('full-reaction-picker-scroll') as HTMLElement;
    await waitFor(() => expect(resultsScroll.scrollTop).toBe(0));
    expect(resultsScroll.scrollHeight).toBeGreaterThan(resultsScroll.clientHeight);
    firstResultRow = await within(resultsScroll).findByTestId(
      'full-reaction-section-results-row-0',
    );
    listBounds = resultsScroll.getBoundingClientRect();
    firstRowBounds = firstResultRow.getBoundingClientRect();
    expect(firstRowBounds.top).toBeGreaterThanOrEqual(listBounds.top);
    expect(firstRowBounds.bottom).toBeLessThanOrEqual(listBounds.bottom);

    resultsScroll.scroll({ top: resultsScroll.scrollHeight, behavior: 'instant' });
    await waitFor(() => expect(resultsScroll.scrollTop).toBeGreaterThan(0));
    await userEvent.clear(search);
    expect(search).toHaveValue('');
    expect(search).toHaveFocus();
    expect(args.onQueryChange).toHaveBeenLastCalledWith('');

    const clearedBrowseScroll = canvas.getByTestId('full-reaction-picker-scroll') as HTMLElement;
    await waitFor(() => expect(clearedBrowseScroll.scrollTop).toBe(0));
    const selectedHearts = within(clearedBrowseScroll)
      .getAllByRole('button')
      .filter((button) => button.textContent === '❤️');
    expect(selectedHearts.length).toBeGreaterThan(0);
    expect(selectedHearts.every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(
      true,
    );
    expect(args.onSelect).not.toHaveBeenCalled();
  },
};

export const SequentialKeyboardBrowseContract: Story = {
  args: { options: reactionEmojiPickerOptions },
  render: (args) => <InteractivePicker {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const document = canvasElement.ownerDocument;
    const dialog = canvas.getByRole('dialog', { name: '반응 선택' });
    const search = canvas.getByRole('searchbox', { name: '반응 검색' });
    const scroll = canvas.getByTestId('full-reaction-picker-scroll') as HTMLElement;
    const finalCatalogOption = reactionEmojiPickerOptions.at(-1);
    const tailName = `${finalCatalogOption?.label} ${finalCatalogOption?.emoji}`;
    await waitFor(() => expect(search).toHaveFocus());
    // The virtualized list can already have mounted the true terminal option.
    const lastInitiallyMountedOption = within(scroll)
      .getAllByRole('button')
      .findLast((button) => button.getAttribute('aria-label') !== tailName)!;
    lastInitiallyMountedOption.focus();
    const nextOption = await waitFor(
      () => {
        expect(lastInitiallyMountedOption).toHaveFocus();
        const buttons = within(scroll).queryAllByRole('button');
        const selectedIndex = buttons.indexOf(lastInitiallyMountedOption);
        expect(selectedIndex).toBeGreaterThanOrEqual(0);
        const nextButton = buttons[selectedIndex + 1];
        expect(nextButton).toBeDefined();
        return nextButton!;
      },
      { container: scroll },
    );
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(nextOption).toHaveFocus();
    search.focus();
    await userEvent.tab();
    const quickOptions = reactionEmojiPickerOptions
      .filter((option) => option.quick)
      .sort((left, right) => (left.quickOrder ?? 0) - (right.quickOrder ?? 0));
    const quickRow = within(canvas.getByTestId('full-reaction-section-quick-row-0'));
    const firstOption = quickRow.getByRole('button', {
      name: `${quickOptions[0]?.label} ${quickOptions[0]?.emoji}`,
    });
    expect(firstOption).toHaveFocus();
    await userEvent.tab();
    const secondOption = quickRow.getByRole('button', {
      name: `${quickOptions[1]?.label} ${quickOptions[1]?.emoji}`,
    });
    expect(secondOption).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(firstOption).toHaveFocus();

    scroll.scroll({ top: scroll.scrollHeight, behavior: 'instant' });
    // Avoid formatting the whole virtualized list on each missing-role poll.
    await waitFor(
      () => expect(within(scroll).queryByRole('button', { name: tailName })).not.toBeNull(),
      { container: scroll },
    );
    const tailOption = within(scroll).getByRole('button', { name: tailName });
    await waitFor(() => {
      const tailRect = tailOption.getBoundingClientRect();
      const scrollRect = scroll.getBoundingClientRect();
      expect(tailRect.top < scrollRect.bottom && tailRect.bottom > scrollRect.top).toBe(true);
    });

    tailOption.focus();
    expect(tailOption).toHaveFocus();
    await userEvent.tab();
    expect(dialog.contains(document.activeElement)).toBe(false);
  },
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
    expect(
      within(canvasElement.ownerDocument.body).getByTestId('full-reaction-picker-sheet'),
    ).toHaveStyle({ height: '480px' });
  },
};

export const MobileExpandedGeometryContract: Story = {
  ...MobileSearchResults,
  play: async ({ canvasElement }) => {
    expect(
      within(canvasElement.ownerDocument.body).getByTestId('full-reaction-picker-sheet'),
    ).toHaveStyle({ height: '720px' });
  },
};

export const MobileHandleExpansionContract: Story = {
  ...MobileBrowse,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const sheet = canvas.getByTestId('full-reaction-picker-sheet');
    expect(sheet).toHaveStyle({ height: '480px' });
    await userEvent.click(canvas.getByTestId('full-reaction-picker-drag-handle'));
    await waitFor(() => expect(parseFloat(getComputedStyle(sheet).height)).toBeGreaterThan(480));
  },
};

export const MobileWebSearchScrollResetContract: Story = {
  ...SearchScrollResetContract,
  globals: mobileGlobals,
};

export const MobileHandleRowTargetContract: Story = {
  ...MobileBrowse,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const sheet = canvas.getByTestId('full-reaction-picker-sheet');
    const handle = canvas.getByTestId('full-reaction-picker-drag-handle');
    const sheetBounds = sheet.getBoundingClientRect();
    const handleBounds = handle.getBoundingClientRect();
    const sheetStyle = getComputedStyle(sheet);
    expect(handleBounds.left).toBeCloseTo(
      sheetBounds.left + parseFloat(sheetStyle.borderLeftWidth),
      0,
    );
    expect(handleBounds.right).toBeCloseTo(
      sheetBounds.right - parseFloat(sheetStyle.borderRightWidth),
      0,
    );
    expect(handleBounds.height).toBe(48);
    // Hit testing must land on the actual button, including both side margins.
    for (const fraction of [0.05, 0.5, 0.95]) {
      const point = {
        x: handleBounds.left + handleBounds.width * fraction,
        y: handleBounds.top + handleBounds.height / 2,
      };
      const target = handle.ownerDocument.elementFromPoint(point.x, point.y);
      expect(target && handle.contains(target)).toBe(true);
    }
    await userEvent.click(handle);
    await waitFor(() => expect(parseFloat(getComputedStyle(sheet).height)).toBeGreaterThan(480));
    await userEvent.click(handle);
    await waitFor(() => expect(sheet).toHaveStyle({ height: '480px' }));
    const search = canvas.getByRole('searchbox', { name: '반응 검색' });
    await userEvent.type(search, '하트');
    await waitFor(() => expect(canvas.getByText(/검색 결과/)).toBeVisible());
    await userEvent.click(canvas.getByRole('button', { name: '빨간 하트 ❤️' }));
    expect(canvas.getByRole('button', { name: '빨간 하트 ❤️' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  },
};
