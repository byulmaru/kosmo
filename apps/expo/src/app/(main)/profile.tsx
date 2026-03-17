import { useTranslation } from 'react-i18next';
import TimelineScreen from '@/components/feed/TimelineScreen';

export default function ProfilePage() {
  const { t } = useTranslation('expo');

  return (
    <TimelineScreen
      eyebrow={t('timeline.profile.eyebrow')}
      title={t('timeline.profile.title')}
      description={t('timeline.profile.description')}
    />
  );
}
