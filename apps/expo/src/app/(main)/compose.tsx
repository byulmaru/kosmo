import { useTranslation } from 'react-i18next';
import TimelineScreen from '@/components/feed/TimelineScreen';

export default function ComposePage() {
  const { t } = useTranslation('expo');

  return (
    <TimelineScreen
      eyebrow={t('timeline.compose.eyebrow')}
      title={t('timeline.compose.title')}
      description={t('timeline.compose.description')}
    />
  );
}
