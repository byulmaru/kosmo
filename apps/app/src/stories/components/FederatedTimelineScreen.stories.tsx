import FederatedTimelineScreen from '@/components/timeline/FederatedTimelineScreen';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';

const selectedProfile = profile({
  displayName: '타임라인 프로필',
  handle: 'timeline-viewer',
  id: 'federated-story-viewer',
  relativeHandle: '@timeline-viewer',
  viewerState: { follow: null, followRequest: null, isSelf: true },
});

const remoteAuthor = profile({
  displayName: '별빛 여행자',
  handle: 'starlight',
  id: 'federated-story-author',
  instance: { canonicalOrigin: 'https://social.example', kind: 'ACTIVITYPUB' },
  relativeHandle: '@starlight@social.example',
});

const storyPost = {
  ...post({
    bodyText: '먼 곳에서 온 공개 소식도 연합 타임라인에서 만나요.',
    id: 'federated-story-post',
    profile: remoteAuthor,
    visibility: 'PUBLIC',
  }),
  viewerReactions: [],
};

const queryData = {
  ...shellQuery({ profiles: [selectedProfile], selectedProfile }),
  federatedTimeline: timeline(storyPost),
};

const meta = {
  component: FederatedTimelineScreen,
  parameters: {
    layout: 'fullscreen',
    relay: { data: queryData },
    router: { pathname: '/federated' },
  },
  title: 'KOSMO/Components/Timeline/FederatedTimelineScreen',
} satisfies Meta<typeof FederatedTimelineScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PublicFederatedPost: Story = {};
