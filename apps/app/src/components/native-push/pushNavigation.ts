import { markNativePushRoute, nativePushNotificationTargetHref } from './pushPayload';
import type { Href } from 'expo-router';
import type { NativePushNotificationTargetQuery$data } from './__generated__/NativePushNotificationTargetQuery.graphql';

type NativePushNotificationNode = NativePushNotificationTargetQuery$data['node'];

type PrepareNativePushNavigationOptions = {
  node: NativePushNotificationNode;
  recipientProfileId: string;
  resetActor: (profileId: string) => void;
  selectProfile: (profileId: string) => Promise<string>;
  selectedProfileId: string | null | undefined;
};

/**
 * Validates the revalidated target before changing the active Profile. A missing target must
 * fall back to Notifications without changing actor state.
 */
export async function prepareNativePushNavigation({
  node,
  recipientProfileId,
  resetActor,
  selectProfile,
  selectedProfileId,
}: PrepareNativePushNavigationOptions): Promise<Href | null> {
  const href = nativePushNotificationTargetHref(node);
  if (!href) {
    return null;
  }

  if (selectedProfileId !== recipientProfileId) {
    const nextProfileId = await selectProfile(recipientProfileId);
    resetActor(nextProfileId);
  }

  return markNativePushRoute(href);
}
