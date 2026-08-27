import { getPublicWebOrigin } from '@/config/origin';

export const LOGOUT_FAILURE_MESSAGE = '로그아웃하지 못했습니다. 다시 시도해주세요.';

export async function requestWebLogout(): Promise<void> {
  const response = await fetch(`${getPublicWebOrigin()}/logout`, {
    cache: 'no-store',
    credentials: 'include',
    method: 'POST',
  });

  if (response.status !== 204) {
    throw new Error(LOGOUT_FAILURE_MESSAGE);
  }
}
