import { expect, spyOn, within } from 'storybook/test';
import HomeScreen from '@/app/(tabs)/(protected)/home';
import type { Meta, StoryObj } from '@storybook/react-vite';

const emptyHomeTimeline = {
  edges: [],
  pageInfo: { endCursor: null, hasNextPage: false },
};
const selectedProfileData = {
  currentSession: { id: 'home-session', selectedProfile: { id: 'home-profile' } },
  homeTimeline: emptyHomeTimeline,
  me: { id: 'home-account', name: 'home-account', profiles: [{ id: 'home-profile' }] },
};

const meta = {
  component: HomeScreen,
  parameters: { layout: 'fullscreen', router: { pathname: '/home' } },
  title: 'KOSMO/Home/Page',
} satisfies Meta<typeof HomeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

function expectHomeBrandHeader(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const headings = canvas.getAllByRole('heading', { name: '홈' });
  const mark = canvasElement.querySelector<HTMLImageElement>('[aria-hidden="true"] img');

  expect(headings).toHaveLength(1);
  expect(mark).not.toBeNull();
  expect(mark?.getBoundingClientRect().width).toBe(38);
  expect(mark?.closest('[aria-hidden="true"]')).not.toBeNull();
}

export const EmptyTimelineFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: { operationResponses: { HomePageQuery: { data: selectedProfileData } } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const emptyTitle = await canvas.findByText('아직 게시글이 없어요');
    const timeline = emptyTitle.parentElement?.parentElement;

    expect(emptyTitle).toBeVisible();
    expect(timeline).not.toBeNull();
    expect(timeline).toHaveStyle({ paddingBottom: '0px', paddingTop: '0px' });
    expectHomeBrandHeader(canvasElement);
  },
};

export const OnboardingCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    relay: {
      operationResponses: {
        HomePageQuery: {
          data: {
            currentSession: { id: 'home-session', selectedProfile: null },
            homeTimeline: emptyHomeTimeline,
            me: { id: 'home-account', name: 'home-account', profiles: [] },
          },
        },
      },
    },
  },
  play: ({ canvasElement }) => expectHomeBrandHeader(canvasElement),
};

export const LoadingFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: {
      operationResponses: { HomePageQuery: { data: selectedProfileData, delayMs: 60_000 } },
    },
  },
  play: ({ canvasElement }) => expectHomeBrandHeader(canvasElement),
};

export const ErrorFull: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (!args.some((argument) => String(argument).includes('홈을 불러오지 못했습니다.'))) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: { operationResponses: { HomePageQuery: { error: '홈을 불러오지 못했습니다.' } } },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByRole('alert')).resolves.toBeVisible();
    expectHomeBrandHeader(canvasElement);
  },
};
