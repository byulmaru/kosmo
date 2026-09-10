import { MutedProfileList } from '@/components/profile/MutedProfileList';

const noopUnmute = () => Promise.resolve();

export function SettingsMutedProfiles() {
  return <MutedProfileList onUnmute={noopUnmute} state={{ status: 'loading' }} />;
}
