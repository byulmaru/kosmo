import { PostVisibility } from '@kosmo/core/enums';
import { AtSignIcon, GlobeIcon, LockIcon, MoonIcon } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';

type PostVisibilityPresentation = Readonly<{
  description: string;
  icon: LucideIcon;
  label: string;
}>;

export const postVisibilityPresentation = {
  [PostVisibility.PUBLIC]: {
    description: '모두가 볼 수 있어요.',
    icon: GlobeIcon,
    label: '공개',
  },
  [PostVisibility.UNLISTED]: {
    description: '모두가 볼 수 있지만 검색되지 않아요.',
    icon: MoonIcon,
    label: '조용한 공개',
  },
  [PostVisibility.FOLLOWERS]: {
    description: '팔로워만 볼 수 있어요.',
    icon: LockIcon,
    label: '팔로워만',
  },
  [PostVisibility.DIRECT]: {
    description: '이 글에서 언급한 계정만 볼 수 있어요.',
    icon: AtSignIcon,
    label: '언급한 계정만',
  },
} as const satisfies Record<PostVisibility, PostVisibilityPresentation>;
