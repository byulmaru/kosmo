import { Hono } from 'hono';
import { nativeSession } from './native-session';
import { upload } from './upload';
import type { Env } from '../context';

export const rest = new Hono<Env>();

rest.route('/', nativeSession);
rest.route('/', upload);
