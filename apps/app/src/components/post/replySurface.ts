import { breakpoints } from '@/theme/tokens';
import type { PostActionExecution } from './postActionAvailability';
import type { PostActionProcessingState } from './PostActionControl';

type ReplySurfacePlatform = 'android' | 'ios' | 'web';
export type ReplySurfacePresentation = 'fullscreen' | 'modal';

export function getReplySurfacePresentation(
  platform: ReplySurfacePlatform,
  width: number,
): ReplySurfacePresentation {
  return platform === 'web' && width >= breakpoints.compact ? 'modal' : 'fullscreen';
}

export function getReplyProcessingState(
  execution: PostActionExecution,
  hasComposerProfile: boolean,
): Exclude<PostActionProcessingState, 'pending'> {
  if (execution.kind === 'resolution-required') {
    return 'default';
  }
  return execution.kind === 'enabled' && hasComposerProfile ? 'default' : 'disabled';
}
