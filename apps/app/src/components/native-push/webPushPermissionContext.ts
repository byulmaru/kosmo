import { createContext, useContext } from 'react';

export type WebPushSupport =
  | 'checking'
  | 'installation-required'
  | 'supported'
  | 'unsupported'
  | 'unavailable';

export type WebPushPermissionContextValue = {
  permission: NotificationPermission;
  support: WebPushSupport;
  syncPermission: (permission: NotificationPermission) => Promise<void>;
};

export const WebPushPermissionContext = createContext<WebPushPermissionContextValue | null>(null);

export function useWebPushPermission(): WebPushPermissionContextValue {
  const value = useContext(WebPushPermissionContext);
  if (!value) {
    throw new Error('Web Push permission actions require NativePushProvider.');
  }

  return value;
}
