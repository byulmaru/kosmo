import { expect, userEvent, within } from 'storybook/test';
import { Button } from '@/components/ui/Button';
import { useRelayActor } from '@/relay/RelayActorProvider';
import baseMeta, {
  activityPost,
  activityProfiles,
  ActorSwitchActivity,
  switchedActivityProfiles,
} from './PostActivity.stories';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
  ...baseMeta,
  parameters: { ...baseMeta.parameters, controls: { disable: true } },
  title: 'KOSMO/Screens/Post Activity/Tests',
} satisfies Meta<typeof baseMeta.component>;

export default meta;
type Story = StoryObj<typeof meta>;

const activityFollowMutationResponse = {
  followProfile: {
    followeeProfile: {
      ...activityProfiles[0],
      viewerState: {
        ...activityProfiles[0]!.viewerState,
        follow: {
          follower: { followingCount: 43, id: 'profile-viewer' },
          id: 'activity-follow-edge',
        },
        followRequest: null,
      },
    },
    followerProfile: { followingCount: 43, id: 'profile-viewer' },
    result: { __typename: 'ProfileFollow', id: 'activity-follow-edge' },
  },
};

export const ProfileRowsHideBioAndNavigate: Story = {
  parameters: {
    ...baseMeta.parameters,
    relay: {
      operationResponses: {
        PostActivityRouteQuery: { data: activityPost() },
        FollowButtonFollowProfileMutation: { data: activityFollowMutationResponse },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole('heading', { name: '재게시한 사람' })).toBeVisible();
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    expect(canvas.queryByText('목록에서 숨겨야 하는 소개입니다.')).not.toBeInTheDocument();
    expect(canvasElement.querySelector('a[href="/@activity-starlight"]')).toBeInTheDocument();
    const follow = canvas.getAllByRole('button', { name: '팔로우' });
    expect(follow).toHaveLength(2);
    await userEvent.click(follow[0]!);
    expect(await canvas.findByRole('button', { name: '팔로잉' })).toBeEnabled();
  },
};

export const InitialErrorKeepsHeaderAndRetries: Story = {
  ...baseMeta,
  parameters: {
    ...baseMeta.parameters,
    controls: { disable: true },
    relay: {
      operationResponses: {
        PostActivityRouteQuery: {
          sequence: [{ error: '재게시한 사람 최초 조회 실패' }, { data: activityPost() }],
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    expect(await page.findByRole('alert')).toHaveTextContent('재게시한 사람을 불러오지 못했어요');
    expect(canvas.getByRole('heading', { name: '재게시한 사람' })).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: '다시 시도' }));
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    expect(page.queryByRole('alert')).not.toBeInTheDocument();
  },
};

export const PaginationFailureKeepsRowsAndRetries: Story = {
  ...baseMeta,
  parameters: {
    ...baseMeta.parameters,
    controls: { disable: true },
    relay: {
      operationResponses: {
        PostActivityRouteQuery: { data: activityPost(activityProfiles, true) },
      },
      paginationResponses: [
        { error: '재게시한 사람 다음 page 실패' },
        { data: activityPost(switchedActivityProfiles) },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const storyWindow = canvasElement.ownerDocument.defaultView!;
    storyWindow.scrollTo(0, storyWindow.document.documentElement.scrollHeight);
    storyWindow.dispatchEvent(new Event('scroll'));
    expect(await page.findByRole('alert')).toHaveTextContent(
      '재게시한 사람을 더 불러오지 못했어요',
    );
    expect(canvas.getByText('별빛 여행자')).toBeVisible();
    await userEvent.click(page.getByRole('button', { name: '다시 시도' }));
    expect(await canvas.findByText('전환된 혜성')).toBeVisible();
    expect(canvas.getAllByText('별빛 여행자')).toHaveLength(1);
    expect(page.queryByRole('alert')).not.toBeInTheDocument();
  },
};

function ActorSwitchScreen() {
  const { resetActor } = useRelayActor();

  return (
    <>
      <Button onPress={() => resetActor('profile-activity-switched')}>활성 프로필 전환</Button>
      <ActorSwitchActivity />
    </>
  );
}

export const ActorSwitchDoesNotReusePreviousRows: Story = {
  ...baseMeta,
  parameters: {
    ...baseMeta.parameters,
    controls: { disable: true },
    relay: {
      actorBoundary: true,
      operationResponses: {
        PostActivityRouteQuery: [
          { data: activityPost(activityProfiles) },
          { data: activityPost([], false, null) },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText('별빛 여행자')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '활성 프로필 전환' }));
    expect(await canvas.findByText('재게시한 사람을 볼 수 없어요')).toBeVisible();
    expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument();
  },
  render: () => <ActorSwitchScreen />,
};

export const LateActorResponseDoesNotLeak: Story = {
  ...baseMeta,
  parameters: {
    ...baseMeta.parameters,
    controls: { disable: true },
    relay: {
      actorBoundary: true,
      operationResponses: {
        PostActivityRouteQuery: [
          { data: activityPost(activityProfiles), delayMs: 2_000 },
          { data: activityPost([], false, null) },
        ],
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('재게시한 사람을 불러오는 중입니다.')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: '활성 프로필 전환' }));
    expect(await canvas.findByText('재게시한 사람을 볼 수 없어요')).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    expect(canvas.queryByText('별빛 여행자')).not.toBeInTheDocument();
  },
  render: () => <ActorSwitchScreen />,
};
