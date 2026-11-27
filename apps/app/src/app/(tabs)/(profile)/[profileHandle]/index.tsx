import { useCurrentRouteInfo } from 'expo-router';
import ProfileScreen from '@/components/profile/ProfileScreen';
import { normalizeProfileHandle } from '@/components/profile/route';

export default function ProfileRoute() {
  const handle = normalizeProfileHandle(useCurrentRouteInfo()?.params.profileHandle);
  return <ProfileScreen handle={handle} connectionKind={null} />;
}
