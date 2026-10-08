import type { Href } from 'expo-router';

type PrepareNativePushNavigationOptions = {
  href: Href;
  recipientProfileId: string;
  resetActor: (profileId: string) => void;
  writeSelectedProfile: (profileId: string) => Promise<void>;
  selectedProfileId: string | null | undefined;
};

/** Selects the recipient Profile locally before returning the validated destination. */
export async function prepareNativePushNavigation({
  href,
  recipientProfileId,
  resetActor,
  writeSelectedProfile,
  selectedProfileId,
}: PrepareNativePushNavigationOptions): Promise<Href> {
  if (selectedProfileId !== recipientProfileId) {
    await writeSelectedProfile(recipientProfileId);
    resetActor(recipientProfileId);
  }

  return href;
}
