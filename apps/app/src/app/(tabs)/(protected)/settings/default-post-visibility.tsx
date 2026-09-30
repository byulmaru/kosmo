import { Redirect } from 'expo-router';

export default function LegacyDefaultPostVisibilityRoute() {
  return <Redirect href="/settings/profile" />;
}
