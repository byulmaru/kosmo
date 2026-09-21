import { useLocalSearchParams } from 'expo-router';
import { Platform } from 'react-native';
import HomeTimelineScreen from '@/components/timeline/HomeTimelineScreen';
import LocalTimelineScreen from '@/components/timeline/LocalTimelineScreen';
import type { TimelineTab } from '@/components/TimelineTabs';

export function TimelineRoute({ initialTab }: { initialTab: TimelineTab }) {
  const { timeline } = useLocalSearchParams<{ timeline?: string | string[] }>();
  const routeTab = Array.isArray(timeline) ? timeline[0] : timeline;
  const activeTab =
    Platform.OS !== 'web' && (routeTab === 'home' || routeTab === 'local') ? routeTab : initialTab;

  return activeTab === 'local' ? <LocalTimelineScreen /> : <HomeTimelineScreen />;
}
