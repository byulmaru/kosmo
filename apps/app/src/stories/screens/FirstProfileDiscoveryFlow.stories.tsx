import { usePathname, useRouter } from 'expo-router';
import { Suspense, useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';
import HomeRoute from '@/app/(tabs)/(protected)/home';
import FirstProfileDiscoveryRoute from '@/app/first-profile/discover';
import {
  FirstProfileOnboardingRoute,
  useFirstProfileOnboarding,
} from '@/components/onboarding/FirstProfileOnboardingRoute';
import { FirstProfileOnboardingScreen } from '@/components/onboarding/FirstProfileOnboardingScreen';
import { firstProfileSteps } from '@/components/onboarding/firstProfileOnboardingState';
import { UniversalShell } from '@/components/shell/UniversalShell';
import { Splash } from '@/components/Splash';
import { SessionProvider } from '@/session/SessionProvider';
import { RouterMockProvider } from '../../../.storybook/mocks/expo-router';
import { RelayStoryProvider } from '../../../.storybook/mocks/react-relay';
import { post, profile, shellQuery, timeline } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { FirstProfileStep } from '@/components/onboarding/firstProfileOnboardingState';
import type { StoryProfile } from '../fixtures';

// Local walkthrough: production flow/actions/screens, with the server represented by fixtures.
function FirstProfileDiscoveryFlow() {
  const server = useMemo(() => {
    let owner = profile({
      id: 'flow-owner',
      handle: 'spring',
      displayName: 'spring',
      bio: null,
      tags: [],
      followingCount: 0,
      followersCount: 0,
      viewerState: {
        isSelf: true,
        membership: { role: 'OWNER' },
        follow: null,
        followRequest: null,
      },
    });
    const people = [
      profile({
        id: 'flow-reader',
        handle: 'reader',
        relativeHandle: '@reader',
        displayName: '책 읽는 봄',
        bio: '읽고 있는 책과 좋아하는 문장을 나눠요.',
        followPolicy: 'OPEN',
        followersCount: 8,
      }),
      profile({
        id: 'flow-music',
        handle: 'music',
        relativeHandle: '@music',
        displayName: '음악을 듣는 밤',
        bio: '책과 음악 이야기를 좋아해요.',
        followPolicy: 'APPROVAL_REQUIRED',
        followersCount: 12,
      }),
    ];
    let created = false;
    let selected = false;
    let target = people[0]!;
    let hashtagId = '';
    const session = () => ({
      data: shellQuery({
        profiles: created ? [owner] : [],
        selectedProfile: selected ? owner : null,
      }),
    });
    const relation = () => ({
      followerProfile: owner,
      followeeProfile: target,
    });
    return {
      get savedTags() {
        return owner.tags;
      },
      queryRequestObserver: (_request: { name: string }, variables: Record<string, unknown>) => {
        if (typeof variables.hashtagId === 'string') {
          hashtagId = variables.hashtagId;
        }
      },
      mutationRequestObserver: (request: { name: string }, variables: Record<string, unknown>) => {
        if (request.name === 'FirstProfileOnboardingCreateMutation') {
          created = true;
          owner = {
            ...owner,
            handle: String(variables.handle),
            relativeHandle: `@${variables.handle}`,
            displayName: String(variables.handle),
          };
        }
        if (request.name === 'FirstProfileOnboardingSelectMutation') {
          selected = true;
        }
        if (request.name === 'FirstProfileOnboardingSaveMutation') {
          const input = variables.input as Omit<Partial<StoryProfile>, 'tags'> & {
            tags?: string[];
          };
          const { tags, ...fields } = input;
          owner = profile({
            ...owner,
            ...fields,
            tags: tags ? tags.map((name) => ({ id: `flow-tag-${name}`, name })) : owner.tags,
          });
        }
        if (request.name.startsWith('FollowButton')) {
          target =
            people.find(
              (person) => person.id === variables.id || `request-${person.id}` === variables.id,
            ) ?? target;
          if (request.name === 'FollowButtonFollowProfileMutation') {
            const approval = target.followPolicy === 'APPROVAL_REQUIRED';
            target.viewerState = {
              ...target.viewerState!,
              follow: approval ? null : { id: `follow-${target.id}`, follower: owner },
              followRequest: approval ? { id: `request-${target.id}` } : null,
            };
            owner.followingCount = people.filter((person) => person.viewerState?.follow).length;
          } else {
            target.viewerState = { ...target.viewerState!, follow: null, followRequest: null };
            owner.followingCount = people.filter((person) => person.viewerState?.follow).length;
          }
        }
      },
      operationResponses: {
        SessionProviderQuery: session,
        FirstProfileOnboardingQuery: session,
        FirstProfileOnboardingCreateMutation: () => ({
          data: { createProfile: { profile: owner } },
          delayMs: 300,
        }),
        FirstProfileOnboardingSelectMutation: () => ({
          data: { selectProfile: { profile: owner } },
          delayMs: 300,
        }),
        FirstProfileOnboardingSaveMutation: () => ({
          data: { updateProfile: { profile: owner } },
          delayMs: 300,
        }),
        FirstProfileTagDiscoveryQuery: () => ({ data: { node: owner }, delayMs: 300 }),
        FirstProfileTagDiscoveryTagQuery: () => ({
          data: {
            node: {
              __typename: 'Hashtag',
              id: hashtagId,
              relatedProfiles: {
                edges: people.map((node) => ({ cursor: node.id, node })),
                pageInfo: {
                  endCursor: people.at(-1)!.id,
                  startCursor: people[0]!.id,
                  hasNextPage: false,
                  hasPreviousPage: false,
                },
              },
            },
          },
          delayMs: 500,
        }),
        FollowButtonFollowProfileMutation: () => ({
          data: {
            followProfile: {
              ...relation(),
              result: {
                __typename:
                  target.followPolicy === 'OPEN' ? 'ProfileFollow' : 'ProfileFollowRequest',
                id: target.viewerState?.follow?.id ?? target.viewerState!.followRequest!.id,
              },
            },
          },
          delayMs: 500,
        }),
        FollowButtonUnfollowProfileMutation: () => ({
          data: { unfollowProfile: relation() },
          delayMs: 500,
        }),
        FollowButtonCancelProfileFollowRequestMutation: () => ({
          data: { cancelProfileFollowRequest: { profileFollowRequestId: `request-${target.id}` } },
          delayMs: 500,
        }),
        UniversalShellQuery: session,
        HomePageQuery: () => ({
          data: {
            ...session().data,
            homeTimeline: timeline(
              ...people
                .filter((person) => person.viewerState?.follow)
                .map((person) => ({
                  ...post({
                    id: `post-${person.id}`,
                    profile: person,
                    bodyText: '오늘 읽은 책에서 좋아하는 문장을 발견했어요.',
                    visibility: 'PUBLIC',
                  }),
                  viewerReactions: [],
                })),
            ),
          },
        }),
      },
    };
  }, []);
  return (
    <RelayStoryProvider
      operationResponses={server.operationResponses}
      mutationRequestObserver={server.mutationRequestObserver}
      queryRequestObserver={server.queryRequestObserver}
    >
      <Suspense fallback={<Splash label="프로필을 불러오는 중이에요." />}>
        <SessionProvider>
          <Walkthrough savedTags={() => server.savedTags.length} />
        </SessionProvider>
      </Suspense>
    </RelayStoryProvider>
  );
}

function Walkthrough({ savedTags }: { savedTags: () => number }) {
  const pathname = usePathname();
  const { height } = useWindowDimensions();
  if (pathname === '/home' || (pathname === '/first-profile/discover' && savedTags() === 0)) {
    return (
      <RouterMockProvider pathname="/home">
        <UniversalShell>
          <HomeRoute />
        </UniversalShell>
      </RouterMockProvider>
    );
  }
  return (
    <View style={{ height }}>
      <FirstProfileOnboardingRoute>
        {pathname === '/first-profile/discover' ? <FirstProfileDiscoveryRoute /> : <InputSteps />}
      </FirstProfileOnboardingRoute>
    </View>
  );
}

function InputSteps() {
  const flow = useFirstProfileOnboarding();
  const pathname = usePathname();
  const router = useRouter();
  const step = pathname.split('/').at(-1) as FirstProfileStep;
  const next = () =>
    router.push(
      `/first-profile/${firstProfileSteps[firstProfileSteps.indexOf(step as FirstProfileStep) + 1]}`,
    );
  return (
    <FirstProfileOnboardingScreen
      avatar={flow.images.avatar.presentation}
      header={flow.images.header.presentation}
      busy={flow.busy}
      created={flow.createdProfile !== null}
      draft={flow.draft}
      errors={flow.errors}
      onChange={flow.setDraft}
      onComplete={() => {
        flow.complete(() => router.push('/first-profile/discover'));
      }}
      onNext={() => {
        if (step !== 'review') {
          flow.next(step, next);
        }
      }}
      onSkip={() => flow.skip(next)}
      onAvatarEdit={() => {
        void flow.pickImage('avatar');
      }}
      onAvatarRemove={() => flow.removeImage('avatar')}
      onAvatarRetry={() => flow.retryImage('avatar')}
      onHeaderEdit={() => {
        void flow.pickImage('header');
      }}
      onHeaderRemove={() => flow.removeImage('header')}
      onHeaderRetry={() => flow.retryImage('header')}
      result={flow.result}
      summary={flow.summary}
      step={step}
    />
  );
}

const meta = {
  component: FirstProfileDiscoveryFlow,
  title: 'KOSMO/Screens/First Profile Discovery Flow',
  globals: { theme: 'light', viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen', router: { pathname: '/first-profile/handle' } },
} satisfies Meta<typeof FirstProfileDiscoveryFlow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const FullFlow: Story = {};
