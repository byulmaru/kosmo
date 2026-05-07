import './polyfill';

export const stack = process.env.STACK ?? 'local';
export const dev = process.env.NODE_ENV !== 'production';
export const sessionName = 'kosmo_session';
