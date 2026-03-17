import { useTranslation } from 'react-i18next';
import TimelineScreen from '@/components/feed/TimelineScreen';

export default function HomePage() {
  const { t } = useTranslation('expo');

  return (
    <TimelineScreen
      eyebrow={t('timeline.home.eyebrow')}
      title={t('timeline.home.title')}
      description={t('timeline.home.description')}
    />
  );
}
