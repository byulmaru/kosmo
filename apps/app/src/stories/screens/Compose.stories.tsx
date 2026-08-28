import { expect, spyOn, waitFor, within } from 'storybook/test';
import ComposeScreen from '@/app/(tabs)/(protected)/compose';
import { profile } from '../fixtures';
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
  title: 'KOSMO/Screens/Compose',
} satisfies Meta<typeof ComposeScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

function expectComposeHeader(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  const heading = canvas.getByRole('heading', { name: '글쓰기' });

  expect(canvas.getAllByRole('heading', { name: '글쓰기' })).toHaveLength(1);
  expect(heading.parentElement?.getBoundingClientRect().height).toBe(64);
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
  play: ({ canvasElement }) => expectComposeHeader(canvasElement),
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
    const canvas = within(canvasElement);
    const stateTitle = await canvas.findByText('프로필이 필요해요');
    const stateCard = stateTitle.parentElement;
    expect(stateCard).not.toBeNull();
    expect(window.getComputedStyle(stateCard!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(window.getComputedStyle(stateCard!).borderTopWidth).toBe('0px');
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
    const status = within(canvasElement).getByRole('status');
    const loadingHost = status.previousElementSibling;
    expect(status).toBeInTheDocument();
    expect(loadingHost).not.toBeNull();
    expect(window.getComputedStyle(loadingHost!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(window.getComputedStyle(loadingHost!).borderTopWidth).toBe('0px');
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

export const SelectedProfileMobileWeb: Story = {
  beforeEach: () => {
    const visualViewport = window.visualViewport;

    if (!visualViewport) {
      throw new Error('Compose mobile story requires visualViewport.');
    }

    const originalWidthDescriptor = Object.getOwnPropertyDescriptor(visualViewport, 'width');
    Object.defineProperty(visualViewport, 'width', { configurable: true, value: 390 });
    visualViewport.dispatchEvent(new Event('resize'));

    return () => {
      if (originalWidthDescriptor) {
        Object.defineProperty(visualViewport, 'width', originalWidthDescriptor);
      } else {
        Reflect.deleteProperty(visualViewport, 'width');
      }
      visualViewport.dispatchEvent(new Event('resize'));
    };
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: SelectedProfileFull.parameters,
  play: async ({ canvasElement }) => {
    await waitFor(() => {
      expect(
        within(canvasElement).queryByRole('heading', { name: '글쓰기' }),
      ).not.toBeInTheDocument();
    });
  },
};
