import TimelineScreen from '@/components/feed/TimelineScreen';

export default function HomePage() {
  return (
    <TimelineScreen
      eyebrow="For you"
      title="Home timeline"
      description="팔로우한 계정과 추천 포스트를 한 화면에서 훑어볼 수 있는 기본 피드입니다."
    />
  );
}
