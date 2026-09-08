import { MutedProfileList } from '@/components/profile/MutedProfileList';

const noopUnmute = () => Promise.resolve();

export function SettingsMutedProfiles() {
  return (
    <MutedProfileList
      onUnmute={noopUnmute}
      scrollable={false}
      showHeading={false}
      state={{ status: 'loading' }}
    />
  );
}
