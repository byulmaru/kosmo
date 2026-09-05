import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { Avatar } from '@/components/ui/Avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { borderWidths, space, textStyles } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

type Props = {
  avatarUri?: string | null;
  avatarLabel: string;
  bio?: string | null;
  children?: ReactNode;
  displayName: string;
  href?: Href;
  onPress?: () => void;
  relativeHandle?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shared row presentation. The Relay wrapper and moderation lists own their actions. */
export function ProfileListItemContent({
  avatarUri,
  avatarLabel,
  bio,
  children,
  displayName,
  href,
  onPress,
  relativeHandle,
  style,
}: Props) {
  const theme = useTheme();
  const content = (
    <>
      <Avatar imageUri={avatarUri} label={avatarLabel} size={40} />
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.foregroundPrimary }]}>
          {displayName}
        </Text>
        {relativeHandle ? (
          <Text numberOfLines={1} style={[styles.handle, { color: theme.foregroundSecondary }]}>
            {relativeHandle}
          </Text>
        ) : null}
        {bio ? (
          <Text numberOfLines={3} style={[styles.bio, { color: theme.foregroundPrimary }]}>
            {bio}
          </Text>
        ) : null}
      </View>
    </>
  );
  return (
    <View
      style={[
        styles.root,
        bio ? styles.withBio : undefined,
        { borderColor: theme.borderDefault },
        style,
      ]}
    >
      {href ? (
        <NavigationLink href={href}>
          <Pressable
            accessibilityRole="link"
            onPress={onPress}
            style={[styles.profile, bio ? styles.profileWithBio : undefined]}
          >
            {content}
          </Pressable>
        </NavigationLink>
      ) : (
        <View style={[styles.profile, bio ? styles.profileWithBio : undefined]}>{content}</View>
      )}
      {children}
    </View>
  );
}
const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderBottomWidth: borderWidths[1],
    flexDirection: 'row',
    gap: space[12],
    paddingHorizontal: space[16],
    paddingVertical: space[12],
  },
  withBio: { alignItems: 'flex-start' },
  profile: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: space[12], minWidth: 0 },
  profileWithBio: { alignItems: 'flex-start' },
  copy: { flex: 1, minWidth: 0 },
  name: textStyles.uiLabelM,
  handle: textStyles.uiCopyS,
  bio: textStyles.uiCopyS,
});
