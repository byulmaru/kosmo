import { useTranslation } from 'react-i18next';
import TimelineScreen from '@/components/feed/TimelineScreen';

export default function NotificationsPage() {
  const { t } = useTranslation('expo');

  return (
    <TimelineScreen
      eyebrow={t('timeline.notifications.eyebrow')}
      title={t('timeline.notifications.title')}
      description={t('timeline.notifications.description')}
    />
  );
}
