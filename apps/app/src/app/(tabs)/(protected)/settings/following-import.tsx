import { Redirect } from 'expo-router';

export default function LegacySettingsFollowingImportRoute() {
  return <Redirect href="/settings/profile-migration" />;
}
