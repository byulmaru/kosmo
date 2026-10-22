import { UniversalShell } from '@/components/shell/UniversalShell';
import { GuestLocalScreen } from '@/components/timeline/LocalTimelineScreen';
import { SessionProvider } from '@/session/SessionProvider';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const author = profile({
  defaultPostVisibility: null,
  displayName: '로컬 기록자',
  handle: 'local-writer',
  id: 'guest-local-author',
  relativeHandle: '@local-writer',
  viewerState: null,
});
const guestData = {
  ...shellQuery(),
  currentSession: null,
  me: null,
  localTimeline: timeline(
    post({
      bodyText: '로그인하지 않아도 로컬의 공개 이야기를 읽을 수 있어요.',
      id: 'guest-local-first-post',
      profile: author,
      visibility: 'PUBLIC',
    }),
    post({
      bodyText: '긴 공개 게시글도 같은 목록에서 이어 읽어요. '.repeat(12),
      id: 'guest-local-long-post',
      profile: author,
      visibility: 'PUBLIC',
    }),
  ),
};

function GuestLocalStory() {
  return (
    <SessionProvider>
      <UniversalShell>
        <GuestLocalScreen />
      </UniversalShell>
    </SessionProvider>
  );
}

const meta = {
  beforeEach: () => sessionStorage.removeItem('kosmo:public-content-invitation-dismissed'),
  component: GuestLocalStory,
  parameters: {
    controls: { disable: true },
    layout: 'fullscreen',
    relay: { data: guestData },
    router: { pathname: '/', segments: [] },
  },
  title: 'KOSMO/Screens/Guest Local',
} satisfies Meta<typeof GuestLocalStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full1440: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileFull' } },
};

export const Compact1024: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoProfileCompact' } },
};

export const Mobile390: Story = {
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
};

export const Loading: Story = {
  parameters: {
    relay: {
      operationResponses: { LocalPageQuery: { data: guestData, delayMs: 60000 } },
    },
  },
};

export const Empty: Story = {
  parameters: {
    relay: { data: { ...guestData, localTimeline: timeline() } },
  },
};

export const InitialErrorRetry: Story = {
  parameters: {
    relay: {
      operationResponses: {
        LocalPageQuery: {
          sequence: [{ error: 'Guest local timeline failed' }, { data: guestData }],
        },
      },
    },
  },
};
