import type { Href } from 'expo-router';

type PrepareNativePushNavigationOptions = {
  href: Href;
  recipientProfileId: string;
  resetActor: (profileId: string) => void;
  selectProfile: (profileId: string) => Promise<string>;
  selectedProfileId: string | null | undefined;
};

/** Selects the recipient Profile before returning the already-validated destination. */
export async function prepareNativePushNavigation({
  href,
  recipientProfileId,
  resetActor,
  selectProfile,
  selectedProfileId,
}: PrepareNativePushNavigationOptions): Promise<Href> {
  if (selectedProfileId !== recipientProfileId) {
    const nextProfileId = await selectProfile(recipientProfileId);
    resetActor(nextProfileId);
  }

  return href;
}
