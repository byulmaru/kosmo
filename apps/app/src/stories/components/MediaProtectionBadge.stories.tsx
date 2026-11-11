import { ImageBackground, StyleSheet, View } from 'react-native';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MediaProtectionBadge } from '@/components/post/MediaProtectionBadge';
import { PostMediaImage } from '@/components/post/PostMediaImage';
import { spacing } from '@/theme/tokens';
import mediaImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';

const imageOpen = fn();

const meta = {
  beforeEach: () => {
    imageOpen.mockClear();
  },
  component: MediaProtectionBadge,
  parameters: { layout: 'centered' },
  render: () => (
    <ImageBackground resizeMode="cover" source={{ uri: mediaImage }} style={styles.preview}>
      <View style={styles.badgePlacement}>
        <MediaProtectionBadge />
      </View>
    </ImageBackground>
  ),
  title: 'KOSMO/Components/Media Protection Badge',
} satisfies Meta<typeof MediaProtectionBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const OpensFilteredImage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const user = userEvent.setup();
    const badge = canvas.getByTestId('media-protection-badge');

    const bounds = badge.getBoundingClientRect();
    const pointerTarget = badge.ownerDocument.elementFromPoint(
      bounds.left + 1,
      bounds.top + bounds.height / 2,
    );
    expect(pointerTarget).toBe(badge);

    await user.hover(badge);
    const tooltip = await page.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('AI 학습방지 필터가 적용되었어요.');

    await user.hover(tooltip);
    expect(tooltip).toBeVisible();
    await user.click(tooltip);
    expect(imageOpen).not.toHaveBeenCalled();

    await user.hover(badge);
    await user.click(badge);
    expect(imageOpen).toHaveBeenCalledOnce();
    expect(imageOpen).toHaveBeenCalledWith(2, expect.any(Object));
    expect(page.queryByRole('tooltip')).not.toBeInTheDocument();
  },
  render: () => (
    <View style={styles.interactivePreview}>
      <PostMediaImage
        index={2}
        item={{
          aiProhibitFilterApplied: true,
          altText: '필터가 적용된 이미지',
          id: 'media-protection-badge-interaction',
          url: mediaImage,
        }}
        onOpen={imageOpen}
      />
    </View>
  ),
};

const styles = StyleSheet.create({
  badgePlacement: { alignItems: 'flex-end', flex: 1, padding: spacing.sm },
  interactivePreview: { width: 320 },
  preview: { height: 156, width: 156 },
});
