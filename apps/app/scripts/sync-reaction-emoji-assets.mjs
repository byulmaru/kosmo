import { cp, mkdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
const packageRoot = path.dirname(require.resolve('emoji-datasource-google/package.json'));
const source = path.join(packageRoot, 'img/google/64');
const destination = path.join(appRoot, 'public/reaction-emoji/emoji-16');

await mkdir(path.dirname(destination), { recursive: true });
await rm(destination, { recursive: true, force: true });
await cp(source, destination, { recursive: true });
