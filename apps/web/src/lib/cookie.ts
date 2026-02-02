import { createIsomorphicFn } from '@tanstack/react-start';
import { getCookie, setCookie } from '@tanstack/react-start/server';
import Cookies from 'js-cookie';

export const getClientCookie = createIsomorphicFn()
  .server((name: string) => getCookie(name))
  .client((name: string) => Cookies.get(name));

export const setClientCookie = createIsomorphicFn()
  .server((name: string, value: string) => setCookie(name, value, { maxAge: 60 * 60 * 24 * 365 }))
  .client((name: string, value: string) => Cookies.set(name, value, { expires: 365 }));
