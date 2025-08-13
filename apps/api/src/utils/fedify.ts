import { federation } from '@kosmo/fedify';
import { env } from '@/env';

export const getFedifyContext = () => {
  const request = new Request(env.PUBLIC_WEB_DOMAIN);
  return federation.createContext(request, null);
};
