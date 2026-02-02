import { PostVisibility } from '@kosmo/enum';
import { AtSignIcon, EarthIcon, LockIcon, MoonIcon } from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';

const POST_VISIBILITY_ICON = {
  [PostVisibility.PUBLIC]: EarthIcon,
  [PostVisibility.UNLISTED]: MoonIcon,
  [PostVisibility.FOLLOWER]: LockIcon,
  [PostVisibility.DIRECT]: AtSignIcon,
} satisfies Record<PostVisibility, LucideIcon>;

type Props = {
  visibility: PostVisibility;
} & LucideProps;

export default function PostVisibilityIcon({ visibility, ...props }: Props) {
  const Icon = POST_VISIBILITY_ICON[visibility];
  return <Icon {...props} />;
}
