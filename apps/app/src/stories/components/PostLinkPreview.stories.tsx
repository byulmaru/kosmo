import { Linking, Pressable } from 'react-native';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { PostLinkPreviewCard } from '@/components/post/PostLinkPreview';
import ogDefaultUrl from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PostLinkPreviewData } from '@/components/post/PostLinkPreview';

type Args = Readonly<{
  interactive: boolean;
  preview: PostLinkPreviewData;
}>;

const parentNavigation = fn().mockName('parent post navigation');
const openExternalUrl = fn(async () => undefined).mockName('open external URL');

const meta = {
  args: {
    interactive: true,
    preview: {
      description: 'KOSMO의 기능 업데이트와 이용 안내를 소개합니다.',
      imageUrl: ogDefaultUrl,
      title: 'KOSMO 업데이트 안내',
      url: 'https://example.com/kosmo/updates',
    },
  },
  argTypes: {
    interactive: { control: 'boolean' },
    preview: { control: 'object' },
  },
  component: PostLinkPreviewCard,
  excludeStories: ['InteractionContract'],
  parameters: { layout: 'padded' },
  title: 'KOSMO/Components/Post Link Preview',
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const TitleOnly: Story = {
  args: {
    preview: {
      description: null,
      imageUrl: null,
      title: '본문에 연결된 페이지',
      url: 'https://example.com/article',
    },
  },
};

export const Image: Story = {
  args: {
    preview: {
      description: '새로운 기능과 커뮤니티 소식을 확인해 보세요.',
      imageUrl: ogDefaultUrl,
      title: '이미지가 있는 링크',
      url: 'https://example.com/image',
    },
  },
};

export const LongContent: Story = {
  args: {
    preview: {
      description:
        '이번 배포에는 알림 전달 지연 감소와 타임라인 응답 개선, 계정 전환 과정에서의 복구 상태 유지가 포함됩니다. 사용 중 발견된 문제도 함께 수정했습니다. 다음 업데이트에서는 검색 결과 정렬과 접근성 개선을 이어갈 예정입니다.',
      imageUrl: ogDefaultUrl,
      title: 'KOSMO 커뮤니티 가을 업데이트: 알림 응답 속도와 계정 전환 안정성 개선',
      url: 'https://example.com/a-very-long-path/whose-full-value-is-not-displayed',
    },
  },
  globals: { viewport: { isRotated: false, value: 'kosmoMobile' } },
  parameters: { layout: 'fullscreen' },
};

export const InteractionContract: Story = {
  render: ({ preview, interactive }) => (
    <Pressable accessible={false} focusable={false} onPress={parentNavigation} tabIndex={-1}>
      <PostLinkPreviewCard interactive={interactive} preview={preview} />
    </Pressable>
  ),
  play: async ({ args, canvasElement }) => {
    const originalOpenURL = Linking.openURL;
    parentNavigation.mockClear();
    openExternalUrl.mockClear();
    Linking.openURL = openExternalUrl;

    try {
      const canvas = within(canvasElement);
      const preview = canvas.getByRole('link', {
        name: `${args.preview.title}, ${new URL(args.preview.url).hostname}`,
      });

      const view = canvasElement.ownerDocument.defaultView;
      if (!view) {
        throw new Error('Storybook canvas must have a window.');
      }
      await userEvent.tab();
      await waitFor(() => {
        expect(canvasElement.ownerDocument.activeElement).toBe(preview);
        expect(view.getComputedStyle(preview).outlineStyle).toBe('solid');
      });

      await userEvent.click(preview);
      await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith(args.preview.url));
      expect(parentNavigation).not.toHaveBeenCalled();
      await waitFor(() => expect(view.getComputedStyle(preview).outlineStyle).toBe('none'));
    } finally {
      Linking.openURL = originalOpenURL;
    }
  },
};
