import { useLocalSearchParams } from 'expo-router';
import ProfileScreen from '@/components/profile/ProfileScreen';
import { normalizeProfileHandle } from '@/components/profile/route';

export default function ProfileRoute() {
  const { profileHandle } = useLocalSearchParams<{ profileHandle?: string | string[] }>();
  return (
    <ProfileScreen handle={normalizeProfileHandle(profileHandle)} connectionKind="followers" />
  );
}
