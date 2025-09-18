import { Hono } from 'hono';
import { upload } from './upload';
import type { Env } from '@/context';

export const rest = new Hono<Env>();

rest.route('/upload', upload);
