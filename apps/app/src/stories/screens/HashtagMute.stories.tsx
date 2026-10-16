import { expect, userEvent, waitFor, within } from 'storybook/test';
import HashtagRelatedProfilesScreen from '@/app/(tabs)/(protected)/hashtags/[hashtagId]/profiles';
import { SessionProvider } from '@/session/SessionProvider';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const hashtagId = 'hashtag-ffxiv';
const rule = {
  __typename: 'HashtagMuteRule',
  id: 'rule-ffxiv',
  scopes: ['NOTIFICATION'],
  expiresAt: null,
  isActive: true,
  appliesTo: true,
};
const hashtag = {
  __typename: 'Hashtag',
  id: hashtagId,
  name: '파판14',
  viewerMuteRule: null,
  relatedProfiles: {
    edges: [
      profile({
        id: 'related-a',
        displayName: '별빛 여행자',
        relativeHandle: '@starlight',
        bio: '에오르제아에서 느긋하게 모험 중 ✨',
      }),
      profile({
        id: 'related-b',
        displayName: '은하 기록자',
        relativeHandle: '@galaxy',
        bio: '파판14 · 스크린샷과 일상 기록',
      }),
    ].map((node, index) => ({ cursor: `related-${index}`, node })),
    pageInfo: {
      endCursor: 'related-1',
      startCursor: 'related-0',
      hasNextPage: false,
      hasPreviousPage: false,
    },
  },
};
const data = {
  currentSession: { id: 'tag-session', selectedProfile: { id: 'tag-viewer' } },
  me: { id: 'tag-account', name: '태그 사용자' },
  node: hashtag,
};
const mutedHashtag = { ...hashtag, viewerMuteRule: rule };

function Screen() {
  return (
    <SessionProvider>
      <HashtagRelatedProfilesScreen />
    </SessionProvider>
  );
}

const meta = {
  component: Screen,
  title: 'KOSMO/Screens/Hashtag Mute',
  parameters: {
    layout: 'fullscreen',
    router: { pathname: `/hashtags/${hashtagId}/profiles`, params: { hashtagId } },
    relay: {
      data,
      operationResponses: {
        ProfileTagMuteActionCreateMutation: {
          data: {
            createHashtagMuteRule: {
              hashtagMuteRule: { id: rule.id, targetHashtag: mutedHashtag },
            },
          },
        },
        ProfileTagMuteActionDeleteMutation: {
          data: { deleteHashtagMuteRule: { hashtagMuteRuleId: rule.id } },
        },
      },
    },
  },
} satisfies Meta<typeof Screen>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Muted: Story = { parameters: { relay: { data: { ...data, node: mutedHashtag } } } };

export const ConfirmMute: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: '#파판14 뮤트' }));
    await expect(
      page.findByRole('dialog', { name: '이 태그를 뮤트할까요?' }),
    ).resolves.toBeVisible();
    expect(page.queryByRole('menu')).not.toBeInTheDocument();
    await waitFor(() => expect(page.getByRole('button', { name: '취소' })).toHaveFocus());
  },
};
export const ConfirmUnmute: Story = {
  parameters: Muted.parameters,
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: '#파판14 뮤트 해제' }));
    await expect(
      page.findByRole('dialog', { name: '이 태그를 뮤트 해제할까요?' }),
    ).resolves.toBeVisible();
  },
};
export const CreateCancelAndDelete: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', { name: '#파판14 뮤트' });
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(page.queryByRole('button', { name: '#파판14 뮤트 해제' })).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('button', { name: '뮤트' }));
    const unmute = await page.findByRole('button', { name: '#파판14 뮤트 해제' });
    await waitFor(() => expect(unmute).toHaveFocus());
    expect(page.getByText('별빛 여행자')).toBeVisible();
    await userEvent.click(unmute);
    await userEvent.click(page.getByRole('button', { name: '뮤트 해제' }));
    await waitFor(() => expect(page.getByRole('button', { name: '#파판14 뮤트' })).toHaveFocus());
    expect(page.getByText('별빛 여행자')).toBeVisible();
  },
};
export const WithoutSelectedProfile: Story = {
  parameters: {
    relay: { data: { ...data, currentSession: { id: 'tag-session', selectedProfile: null } } },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.findByRole('heading', { name: '#파판14 관련 프로필' }),
    ).resolves.toBeVisible();
    expect(canvas.getByText('별빛 여행자')).toBeVisible();
    expect(canvas.queryByTestId('profile-tag-mute-trigger')).not.toBeInTheDocument();
  },
};
export const LongTag: Story = {
  parameters: {
    relay: {
      data: { ...data, node: { ...hashtag, name: '아주긴프로필태그이름을가진모험가들의모임' } },
    },
  },
};

export const FailedRequestCanRetry: Story = {
  parameters: {
    relay: {
      operationResponses: {
        ProfileTagMuteActionCreateMutation: {
          sequence: [
            { error: '요청 실패' },
            {
              data: {
                createHashtagMuteRule: {
                  hashtagMuteRule: { id: rule.id, targetHashtag: mutedHashtag },
                },
              },
            },
          ],
        },
        ProfileTagMuteActionRefetchQuery: { data: { node: hashtag } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: '#파판14 뮤트' }));
    await userEvent.click(page.getByRole('button', { name: '뮤트' }));
    await expect(page.findByRole('alert')).resolves.toHaveTextContent('상태를 변경하지 못했어요');
    const trigger = await page.findByRole('button', { name: '#파판14 뮤트' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(page.getByText('별빛 여행자')).toBeVisible();
    await userEvent.click(trigger);
    await userEvent.click(page.getByRole('button', { name: '뮤트' }));
    await expect(page.findByRole('button', { name: '#파판14 뮤트 해제' })).resolves.toBeVisible();
  },
};

export const PendingConfirmation: Story = {
  parameters: {
    relay: {
      operationResponses: { ProfileTagMuteActionCreateMutation: { delayMs: 60000, data: {} } },
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(await page.findByRole('button', { name: '#파판14 뮤트' }));
    await userEvent.click(page.getByRole('button', { name: '뮤트' }));
    expect(page.getByRole('button', { name: '뮤트' })).toBeDisabled();
    expect(page.getByRole('button', { name: '취소' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(page.getByRole('dialog', { name: '이 태그를 뮤트할까요?' })).toBeVisible();
  },
};

export const TemporaryRulePreserved: Story = {
  parameters: {
    relay: {
      data: {
        ...data,
        node: {
          ...hashtag,
          viewerMuteRule: {
            ...rule,
            scopes: ['HOME'],
            expiresAt: '2099-01-01T00:00:00Z',
            appliesTo: false,
          },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    const trigger = await page.findByRole('button', {
      name: '#파판14 새 알림 뮤트 불가. 다른 임시 뮤트 규칙이 적용 중',
    });
    expect(trigger).not.toHaveAttribute('aria-haspopup');
    await userEvent.click(trigger);
    await expect(page.findByRole('alert')).resolves.toHaveTextContent('현재 규칙을 보존');
    expect(page.queryByRole('dialog')).not.toBeInTheDocument();
    expect(page.getByText('별빛 여행자')).toBeVisible();
  },
};
