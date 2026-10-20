import { ContentReportTargetType } from '@kosmo/core/enums';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { graphql, useLazyLoadQuery } from 'react-relay';
import { fn } from 'storybook/test';
import {
  ContentReportProvider,
  getContentReportBlockProfile,
  useContentReportMenuItem,
} from '@/components/content-report/ContentReportContext';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { SessionProvider } from '@/session/SessionProvider';
import { profile } from '../fixtures';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ContentReportOverlay_blockProfile$key } from '@/components/content-report/__generated__/ContentReportOverlay_blockProfile.graphql';
import type { ContentReportPreviewQuery as ContentReportPreviewQueryType } from './__generated__/ContentReportPreviewQuery.graphql';

const mutationRequestObserver = fn().mockName('ContentReport mutation');
export const reportAuthor = profile({ id: 'content-report-author', displayName: '민지' });
export const longReportAuthor = profile({
  id: 'content-report-long-handle',
  displayName: '민지',
  relativeHandle: '@minji@long-federated-instance-name.example.social',
});
const selfAuthor = profile({
  id: 'content-report-self',
  viewerState: {
    blockedBy: false,
    follow: null,
    followRequest: null,
    isSelf: true,
    profileBlock: null,
  },
});
const blockedAuthor = profile({
  id: 'content-report-blocked',
  viewerState: {
    blockedBy: false,
    follow: null,
    followRequest: null,
    isSelf: false,
    profileBlock: { id: 'content-report-block', targetProfile: reportAuthor },
  },
});
const blockedByAuthor = profile({
  id: 'content-report-blocked-by',
  viewerState: {
    blockedBy: true,
    follow: null,
    followRequest: null,
    isSelf: false,
    profileBlock: null,
  },
});
const reportAuthors = [reportAuthor, longReportAuthor, selfAuthor, blockedAuthor, blockedByAuthor];

const ContentReportPreviewQuery = graphql`
  query ContentReportPreviewQuery($ids: [ID!]!) {
    nodes(ids: $ids) {
      __typename
      ... on Profile {
        id
        displayName
        relativeHandle
        ...ContentReportOverlay_blockProfile @alias(as: "blockProfile")
        viewerState {
          blockedBy
          isSelf
          profileBlock {
            id
          }
        }
      }
    }
  }
`;

function ContentReportTrigger({
  blockProfile,
  onReportOpen,
}: {
  blockProfile?: ContentReportOverlay_blockProfile$key;
  onReportOpen?: () => void;
}) {
  const reportItem = useContentReportMenuItem({
    id: 'post-local-preview',
    kind: ContentReportTargetType.POST,
    label: '@minji의 게시물',
    blockProfile,
  });
  const menuItem = {
    ...reportItem,
    onSelect: () => {
      reportItem.onSelect();
      onReportOpen?.();
    },
  };

  return (
    <ActionMenu
      accessibilityLabel="콘텐츠 신고 메뉴"
      items={[menuItem]}
      renderTrigger={({ expanded, onPress, ref }) => (
        <Pressable
          accessibilityLabel="신고 메뉴 열기"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={onPress}
          ref={ref}
        >
          <Text>신고 UI 열기</Text>
        </Pressable>
      )}
      webPlacement="overlap-end"
    />
  );
}

export function ContentReportPreview({
  hideTriggerOnOpen = false,
  reportProfileId = reportAuthor.id,
}: {
  hideTriggerOnOpen?: boolean;
  reportProfileId?: string;
}) {
  return (
    <SessionProvider>
      <ContentReportPreviewContent
        hideTriggerOnOpen={hideTriggerOnOpen}
        reportProfileId={reportProfileId}
      />
    </SessionProvider>
  );
}

function ContentReportPreviewContent({
  hideTriggerOnOpen,
  reportProfileId,
}: {
  hideTriggerOnOpen: boolean;
  reportProfileId: string;
}) {
  const [triggerVisible, setTriggerVisible] = useState(true);
  const data = useLazyLoadQuery<ContentReportPreviewQueryType>(ContentReportPreviewQuery, {
    ids: reportAuthors.map(({ id }) => id),
  });
  const reportProfile = data.nodes.find(
    (node) => node?.__typename === 'Profile' && node.id === reportProfileId,
  );
  if (!reportProfile || reportProfile.__typename !== 'Profile') {
    throw new Error(`Missing content report profile fixture: ${reportProfileId}.`);
  }
  const blockProfile = getContentReportBlockProfile(
    reportProfile.blockProfile
      ? {
          ...reportProfile.blockProfile,
          viewerState: reportProfile.viewerState,
        }
      : null,
  );

  return (
    <ContentReportProvider>
      <View style={{ flex: 1 }} testID="universal-shell-root" tabIndex={-1}>
        {triggerVisible ? (
          <ContentReportTrigger
            blockProfile={blockProfile}
            onReportOpen={() => {
              if (hideTriggerOnOpen) {
                requestAnimationFrame(() => setTriggerVisible(false));
              }
            }}
          />
        ) : null}
      </View>
    </ContentReportProvider>
  );
}

const meta = {
  beforeEach: () => {
    mutationRequestObserver.mockClear();
  },
  excludeStories: ['ContentReportPreview'],
  parameters: {
    a11y: {
      config: {
        rules: [
          { enabled: false, id: 'aria-allowed-attr' },
          { enabled: false, id: 'color-contrast' },
        ],
      },
    },
    layout: 'fullscreen',
    relay: {
      data: {
        currentSession: { id: 'content-report-session', selectedProfile: { id: 'profile-viewer' } },
        me: { id: 'account-story', name: '스토리 계정' },
        nodes: reportAuthors,
      },
      mutationRequestObserver,
      mutationResponse: { submitContentReport: { status: 'DELIVERED' } },
    },
  },
  render: () => <ContentReportPreview />,
  title: 'KOSMO/Screens/Content Report',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const PostReport: Story = {};
