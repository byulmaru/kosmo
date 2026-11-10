import { ImageBackground, StyleSheet, View } from 'react-native';
import { MediaProtectionBadge } from '@/components/post/MediaProtectionBadge';
import { spacing } from '@/theme/tokens';
import mediaImage from '../../../public/og-default.png?url';
import type { Meta, StoryObj } from '@storybook/react-vite';

const meta = {
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

const styles = StyleSheet.create({
  badgePlacement: { alignItems: 'flex-end', flex: 1, padding: spacing.sm },
  preview: { height: 156, width: 156 },
});
