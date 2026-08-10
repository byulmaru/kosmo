import { Pressable, StyleSheet, Text, View } from 'react-native';
import { graphql, useFragment } from 'react-relay';
import { NavigationLink } from '@/components/shell/NavigationLink';
import { useTheme } from '@/theme/ThemeProvider';
import { radii, typography } from '@/theme/tokens';
import type { Href } from 'expo-router';
import type { StyleProp, ViewStyle } from 'react-native';
import type { ProfileNameBlock_profile$key } from './__generated__/ProfileNameBlock_profile.graphql';

type ProfileNameBlockProps = {
  href?: Href;
  profile: ProfileNameBlock_profile$key;
  style?: StyleProp<ViewStyle>;
};

type ProfileNameBlockViewProps = {
  displayName: string;
  relativeHandle: string;
  style?: StyleProp<ViewStyle>;
};

const profileNameBlockFragment = graphql`
  fragment ProfileNameBlock_profile on Profile {
    displayName
    relativeHandle
  }
`;

export function ProfileNameBlock({ href, profile, style }: ProfileNameBlockProps) {
  const data = useFragment(profileNameBlockFragment, profile);

  if (href) {
    return (
      <NavigationLink href={href}>
        <Pressable accessibilityRole="link" style={StyleSheet.flatten([styles.root, style])}>
          <ProfileNameBlockView
            displayName={data.displayName}
            relativeHandle={data.relativeHandle}
          />
        </Pressable>
      </NavigationLink>
    );
  }

  return (
    <ProfileNameBlockView
      displayName={data.displayName}
      relativeHandle={data.relativeHandle}
      style={style}
    />
  );
}

export function ProfileNameBlockView({
  displayName,
  relativeHandle,
  style,
}: ProfileNameBlockViewProps) {
  const theme = useTheme();

  return (
    <View style={[styles.root, style]}>
      <Text numberOfLines={1} style={[styles.displayName, { color: theme.text }]}>
        {displayName}
      </Text>
      <Text numberOfLines={1} style={[styles.handle, { color: theme.textSecondary }]}>
        {relativeHandle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radii.md, flex: 1, minWidth: 0 },
  displayName: { fontFamily: 'SUIT', fontWeight: '700', ...typography.md },
  handle: { fontFamily: 'SUIT', ...typography.sm },
});
