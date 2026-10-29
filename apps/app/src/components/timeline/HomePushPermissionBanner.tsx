import { useState } from 'react';
import { View } from 'react-native';
import { useWebPushPermission } from '@/components/native-push/webPushPermissionContext';
import { NotificationPermissionBanner } from '@/components/ui/NotificationPermissionBanner';
import { useToast } from '@/components/ui/ToastProvider';
import { space } from '@/theme/tokens';

const dismissedKey = 'kosmo:home-notification-permission-banner-dismissed';

export function HomePushPermissionBanner() {
  const { permission, requestPermission, support } = useWebPushPermission();
  const { showToast } = useToast();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [pending, setPending] = useState(false);
  const showPermissionError = () => {
    showToast('브라우저 알림 권한을 요청하지 못했어요. 잠시 후 다시 시도해 주세요.', {
      tone: 'danger',
    });
  };

  if (dismissed || support !== 'supported' || permission !== 'default') {
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

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(dismissedKey, '1');
    } catch {
      // Keep the banner dismissed for this mount when browser storage is unavailable.
    }
  };

  return (
    <View style={{ marginHorizontal: space[12], marginVertical: space[12] }}>
      <NotificationPermissionBanner
        onDismiss={handleDismiss}
        onEnable={handleEnable}
        pending={pending}
      />
    </View>
  );
}

function readDismissed() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(dismissedKey) === '1';
  } catch {
    return false;
  }
}
