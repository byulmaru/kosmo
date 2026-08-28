import { breakpoints } from '@/theme/tokens';
import type { PostActionExecution } from './postActionAvailability';
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
  execution: PostActionExecution,
  hasComposerProfile: boolean,
): PostActionProcessingState {
  if (execution.kind === 'resolution-required') {
    return 'default';
  }
  return execution.kind === 'enabled' && hasComposerProfile ? 'default' : 'disabled';
}
