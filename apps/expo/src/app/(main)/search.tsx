import { useTranslation } from 'react-i18next';
import TimelineScreen from '@/components/feed/TimelineScreen';

export default function SearchPage() {
  const { t } = useTranslation('expo');

  return (
    <TimelineScreen
      eyebrow={t('timeline.search.eyebrow')}
      title={t('timeline.search.title')}
      description={t('timeline.search.description')}
    />
  );
}
