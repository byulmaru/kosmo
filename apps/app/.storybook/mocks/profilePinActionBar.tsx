import { createContext, useContext } from 'react';
import { PostActionBar as ProductionPostActionBar } from '../../src/components/post/PostActionBar';
import type { PostActionBarProps } from '../../src/components/post/PostActionBar';

// Pin execution is a Storybook fixture until PROD-809 supplies a real mutation.
export const ProfilePinStoryContext = createContext<Pick<
  PostActionBarProps,
  'moreItems' | 'morePending' | 'onMoreTriggerReady' | 'moreSheetIconSize'
> | null>(null);

export function PostActionBar(props: PostActionBarProps) {
  const pin = useContext(ProfilePinStoryContext);
  return pin ? (
    <ProductionPostActionBar
      {...props}
      {...pin}
      moreItems={[...(props.moreItems ?? []), ...(pin.moreItems ?? [])]}
    />
  ) : (
    <ProductionPostActionBar {...props} />
  );
}
