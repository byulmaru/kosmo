import { expect, spyOn, within } from 'storybook/test';
import ComposeScreen from '@/app/(tabs)/(protected)/compose';
import { profile } from './fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const composerProfile = profile({
  displayName: '별빛 작가',
  handle: 'starlight-writer',
  id: 'compose-profile',
  relativeHandle: '@starlight-writer',
});

const meta = {
  component: ComposeScreen,
  parameters: { layout: 'fullscreen', router: { pathname: '/compose' } },
  title: 'KOSMO/Compose/Page',
} satisfies Meta<typeof ComposeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

function expectComposeHeader(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const heading = canvas.getByRole('heading', { name: '글쓰기' });

  expect(canvas.getAllByRole('heading', { name: '글쓰기' })).toHaveLength(1);
  expect(heading.parentElement?.getBoundingClientRect().height).toBe(64);
  expect(canvas.queryByText('KOSMO')).not.toBeInTheDocument();
}

export const SelectedProfileFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: {
      operationResponses: {
        ComposePageQuery: {
          data: { currentSession: { id: 'compose-session', selectedProfile: composerProfile } },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).findByRole('textbox', { name: '게시글 본문' }),
    ).resolves.toBeVisible();
    expectComposeHeader(canvasElement);
  },
};

export const ProfileRequiredCompact: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoCompact' } },
  parameters: {
    relay: {
      operationResponses: {
        ComposePageQuery: {
          data: { currentSession: { id: 'compose-session', selectedProfile: null } },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByText('프로필이 필요해요')).resolves.toBeVisible();
    expectComposeHeader(canvasElement);
  },
};

export const LoadingFull: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: {
      operationResponses: {
        ComposePageQuery: {
          data: { currentSession: { id: 'compose-session', selectedProfile: composerProfile } },
          delayMs: 60_000,
        },
      },
    },
  },
  play: ({ canvasElement }) => {
    expect(within(canvasElement).getByText('글쓰기 화면을 불러오는 중입니다.')).toBeInTheDocument();
    expectComposeHeader(canvasElement);
  },
};

export const ErrorFull: Story = {
  beforeEach: () => {
    const originalError = console.error;
    const errorSpy = spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      if (
        !args.some((argument) => String(argument).includes('글쓰기 정보를 불러오지 못했습니다.'))
      ) {
        originalError(...args);
      }
    });

    return () => errorSpy.mockRestore();
  },
  globals: { viewport: { isRotated: false, value: 'kosmoFull' } },
  parameters: {
    relay: {
      operationResponses: {
        ComposePageQuery: { error: '글쓰기 정보를 불러오지 못했습니다.' },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).findByRole('alert')).resolves.toBeVisible();
    expectComposeHeader(canvasElement);
  },
};
