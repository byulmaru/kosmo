import type { RefObject } from 'react';
import type { View as NativeView } from 'react-native';
import type { CoachmarkStep } from '@/components/coachmark/CoachmarkProvider';

export type PostDetailCoachmarkTargets = Readonly<{
  bookmark: RefObject<NativeView | null> | null;
  reaction: RefObject<NativeView | null> | null;
  reactionSummary: RefObject<NativeView | null> | null;
  repost: RefObject<NativeView | null> | null;
  reply: RefObject<NativeView | null> | null;
}>;

const postDetailCoachmarkCopy = [
  {
    description:
      '반응 버튼을 눌러 원하는 이모지를 골라 보세요. 여러 종류의 이모지로 반응할 수 있어요.',
    title: '이모지로 마음을 표현해요',
  },
  {
    description:
      '이미 붙어 있는 이모지를 눌러 같은 반응을 남길 수도 있어요. 내가 선택한 이모지를 다시 누르면 반응이 취소돼요.',
    title: '같은 마음이라면 이모지를 눌러요',
  },
  {
    description:
      '메뉴에서 ‘재게시하기’를 선택하면 이 글을 내 팔로워에게 공유할 수 있어요. 다시 메뉴를 열면 재게시를 취소할 수 있어요.',
    title: '함께 보고 싶은 글을 공유해요',
  },
  {
    description:
      '저장한 글은 현재 프로필의 북마크 목록에서 다시 볼 수 있어요. 저장 사실은 다른 사람에게 공개되거나 작성자에게 알림으로 전달되지 않아요.',
    title: '다시 보고 싶은 글을 저장해요',
  },
  {
    description:
      '답글 버튼을 눌러 이 글에 대한 이야기를 이어가 보세요. 게시하기 전에 작성 화면에서 공개범위를 확인할 수 있어요.',
    title: '답글로 대화를 이어가요',
  },
] as const;

export function createPostDetailCoachmarkSteps(
  targets: PostDetailCoachmarkTargets,
): readonly CoachmarkStep[] {
  const candidateSteps: Array<CoachmarkStep | null> = [
    targets.reaction && { anchorRef: targets.reaction, ...postDetailCoachmarkCopy[0] },
    targets.reactionSummary && {
      anchorRef: targets.reactionSummary,
      ...postDetailCoachmarkCopy[1],
    },
    targets.repost && { anchorRef: targets.repost, ...postDetailCoachmarkCopy[2] },
    targets.bookmark && { anchorRef: targets.bookmark, ...postDetailCoachmarkCopy[3] },
    targets.reply && { anchorRef: targets.reply, ...postDetailCoachmarkCopy[4] },
  ];
  return candidateSteps.filter((step): step is CoachmarkStep => Boolean(step?.anchorRef.current));
}
