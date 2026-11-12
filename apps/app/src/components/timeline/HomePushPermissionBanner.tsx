import { Bell } from 'lucide-react-native';
import { useState } from 'react';
import { useWebPushPermission } from '@/components/native-push/webPushPermissionContext';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { space } from '@/theme/tokens';

const dismissalKey = 'kosmo:home-notification-permission-banner-dismissed';

export function HomePushPermissionBanner() {
  const { permission, requestPermission, support } = useWebPushPermission();
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const showPermissionError = () => {
    showToast('브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.', {
      tone: 'danger',
    });
  };

  if (support !== 'supported' || permission !== 'default') {
    return null;
  }

  const handleEnable = () => {
    let request: Promise<void>;
    try {
      request = requestPermission();
    } catch {
      showPermissionError();
      return;
    }

    setPending(true);
    void request.catch(showPermissionError).finally(() => setPending(false));
  };

  return (
    <Banner
      action={
        <Button
          accessibilityLabel="푸시 알림 켜기"
          loading={pending}
          onPress={handleEnable}
          size="compact"
        >
          켜기
        </Button>
      }
      dismissalKey={dismissalKey}
      dismissDisabled={pending}
      icon={Bell}
      message="푸시 알림 받기"
      style={{ marginHorizontal: space[12], marginVertical: space[12] }}
    />
  );
}
