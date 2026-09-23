import { useEffect } from 'react';
import { trackAnalytics } from './client';

/** Mounted only after valid Profile data is ready, including when its post list fails. */
export function ProfileViewAnalytics() {
  useEffect(() => {
    trackAnalytics('profile_view_succeeded', {});
  }, []);
  return null;
}
