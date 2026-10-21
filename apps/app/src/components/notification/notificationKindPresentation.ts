import { AtSign, MessageCircle, Quote, Repeat2, Smile, UserRoundPlus } from 'lucide-react-native';

export const notificationKindPresentations = {
  follow: { Icon: UserRoundPlus, label: '팔로우 알림' },
  followRequest: { Icon: UserRoundPlus, label: '팔로우 요청 알림' },
  reaction: { Icon: Smile, label: '반응 알림' },
  repost: { Icon: Repeat2, label: '재게시 알림' },
  mention: { Icon: AtSign, label: '멘션 알림' },
  reply: { Icon: MessageCircle, label: '답글 알림' },
  quote: { Icon: Quote, label: '인용 알림' },
} as const;
