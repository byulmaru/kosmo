import 'core-js/actual/array/to-sorted';
import 'core-js/proposals/array-buffer-base64';

export const stack = process.env.STACK ?? 'local';
export const dev = process.env.NODE_ENV !== 'production';
export const sessionName = 'kosmo_session';
