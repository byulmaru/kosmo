import { ContentReportTargetType } from '@kosmo/core/enums';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { fn } from 'storybook/test';
import {
  ContentReportProvider,
  useContentReportMenuItem,
} from '@/components/content-report/ContentReportContext';
import { ActionMenu } from '@/components/ui/ActionMenu';
import type { Meta, StoryObj } from '@storybook/react-vite';

const mutationRequestObserver = fn().mockName('ContentReport mutation');

function ContentReportTrigger({ onReportOpen }: { onReportOpen?: () => void }) {
  const reportItem = useContentReportMenuItem({
    id: 'post-local-preview',
    kind: ContentReportTargetType.POST,
    label: '@minji의 게시물',
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
}: {
  hideTriggerOnOpen?: boolean;
}) {
  const [triggerVisible, setTriggerVisible] = useState(true);

  return (
    <ContentReportProvider>
      <View style={{ flex: 1 }} testID="universal-shell-root" tabIndex={-1}>
        {triggerVisible ? (
          <ContentReportTrigger
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
