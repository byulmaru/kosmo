import { breakpoints } from '@/theme/tokens';
import type { PostActionProcessingState } from './PostActionControl';

type ReplySurfaceOwner = 'detail' | 'list';
type ReplySurfacePlatform = 'android' | 'ios' | 'web';
export type ReplySurfacePresentation = 'fullscreen' | 'inline' | 'modal';

export function getReplySurfacePresentation(
  owner: ReplySurfaceOwner,
  platform: ReplySurfacePlatform,
  width: number,
): ReplySurfacePresentation {
  if (owner === 'detail') {
    return 'inline';
  }
  return platform === 'web' && width >= breakpoints.compact ? 'modal' : 'fullscreen';
}

export function getReplyProcessingState(
  hasSelectedProfile: boolean,
  displayPostHasContent: boolean,
): PostActionProcessingState {
  return hasSelectedProfile && displayPostHasContent ? 'default' : 'disabled';
}
