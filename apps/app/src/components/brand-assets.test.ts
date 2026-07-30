import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const brandDirectory = new URL('../../assets/brand/', import.meta.url);
const publicDirectory = new URL('../../public/', import.meta.url);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function readRequiredFile(file: URL) {
  const contents = await readFile(file).catch(() => null);
  assert.ok(contents, `${file.pathname} must exist`);
  return contents;
}

async function readPngDimensions(file: URL) {
  const contents = await readRequiredFile(file);
  assert.deepEqual(contents.subarray(0, 8), pngSignature, `${file.pathname} must be a PNG`);
  return {
    height: contents.readUInt32BE(20),
    width: contents.readUInt32BE(16),
  };
}

test('native and reusable brand assets keep their approved source dimensions', async () => {
  const fullLogoSvg = (
    await readRequiredFile(new URL('brand-logo-full-light.svg', brandDirectory))
  ).toString('utf8');
  assert.match(fullLogoSvg, /^<svg width="1720" height="1050" viewBox="[^"]*1720 1050"/);
  assert.deepEqual(await readPngDimensions(new URL('brand-logo-full-light.png', brandDirectory)), {
    height: 1050,
    width: 1720,
  });
  assert.deepEqual(await readPngDimensions(new URL('brand-mark-light.png', brandDirectory)), {
    height: 1024,
    width: 1024,
  });
  assert.deepEqual(await readPngDimensions(new URL('app-icon-ios-light.png', brandDirectory)), {
    height: 1024,
    width: 1024,
  });
  assert.deepEqual(
    await readPngDimensions(new URL('app-icon-android-foreground.png', brandDirectory)),
    { height: 1024, width: 1024 },
  );
});

test('browser, PWA, and share assets expose the expected delivery sizes', async () => {
  for (const [name, size] of [
    ['favicon-32x32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ] as const) {
    assert.deepEqual(await readPngDimensions(new URL(name, publicDirectory)), {
      height: size,
      width: size,
    });
  }

  assert.deepEqual(await readPngDimensions(new URL('og-default.png', publicDirectory)), {
    height: 630,
    width: 1200,
  });

  const manifest = JSON.parse(
    await readFile(new URL('site.webmanifest', publicDirectory), 'utf8'),
  ) as { icons?: Array<{ purpose?: string; sizes?: string; src?: string }> };
  assert.deepEqual(manifest.icons, [
    { sizes: '192x192', src: '/icon-192.png', type: 'image/png' },
    { sizes: '512x512', src: '/icon-512.png', type: 'image/png' },
    {
      purpose: 'maskable',
      sizes: '512x512',
      src: '/icon-maskable-512.png',
      type: 'image/png',
    },
  ]);
});
