import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

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

async function readPngRgba(file: URL) {
  const contents = await readRequiredFile(file);
  assert.deepEqual(contents.subarray(0, 8), pngSignature, `${file.pathname} must be a PNG`);

  let width = 0;
  let height = 0;
  let offset = 8;
  const imageData: Buffer[] = [];

  while (offset < contents.length) {
    const length = contents.readUInt32BE(offset);
    const type = contents.toString('ascii', offset + 4, offset + 8);
    const data = contents.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, `${file.pathname} must use 8-bit channels`);
      assert.equal(data[9], 6, `${file.pathname} must use RGBA color`);
    } else if (type === 'IDAT') {
      imageData.push(data);
    }
    offset += length + 12;
  }

  assert.ok(width > 0 && height > 0 && imageData.length > 0, `${file.pathname} must be complete`);
  const encoded = inflateSync(Buffer.concat(imageData));
  const stride = width * 4;
  const rgba = Buffer.alloc(stride * height);
  let encodedOffset = 0;

  const paeth = (left: number, above: number, upperLeft: number) => {
    const prediction = left + above - upperLeft;
    const leftDistance = Math.abs(prediction - left);
    const aboveDistance = Math.abs(prediction - above);
    const upperLeftDistance = Math.abs(prediction - upperLeft);
    if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) {
      return left;
    }
    return aboveDistance <= upperLeftDistance ? above : upperLeft;
  };

  for (let y = 0; y < height; y += 1) {
    const filter = encoded[encodedOffset];
    encodedOffset += 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const value = encoded[encodedOffset];
      encodedOffset += 1;
      const left = x >= 4 ? rgba[rowOffset + x - 4] : 0;
      const above = y > 0 ? rgba[rowOffset + x - stride] : 0;
      const upperLeft = x >= 4 && y > 0 ? rgba[rowOffset + x - stride - 4] : 0;
      const predictor =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? above
              : filter === 3
                ? Math.floor((left + above) / 2)
                : paeth(left, above, upperLeft);
      rgba[rowOffset + x] = (value + predictor) & 0xff;
    }
  }

  return { height, rgba, width };
}

test('native and reusable brand assets keep their approved source dimensions', async () => {
  const fullLogoSvg = (
    await readRequiredFile(new URL('brand-logo-full-light.svg', brandDirectory))
  ).toString('utf8');
  assert.match(fullLogoSvg, /^<svg width="1665" height="1050" viewBox="[^"]*1665 1050"/);
  assert.deepEqual(await readPngDimensions(new URL('brand-logo-full-light.png', brandDirectory)), {
    height: 1050,
    width: 1665,
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

test('browser favicon uses the browser-only K and star composition', async () => {
  const { height, rgba, width } = await readPngRgba(new URL('favicon-32x32.png', publicDirectory));
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] <= 8) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  assert.ok(rgba.some((value, index) => index % 4 === 3 && value === 0));
  assert.equal(maxX - minX + 1, 29, 'browser favicon must keep its compact K silhouette');
  assert.equal(maxY - minY + 1, 32, 'favicon mark must reach both vertical edges');

  const starPixel = (24 * width + 5) * 4;
  assert.ok(
    rgba[starPixel] >= 130 &&
      rgba[starPixel + 1] >= 110 &&
      rgba[starPixel + 2] >= 220 &&
      rgba[starPixel + 3] === 255,
    'browser favicon must keep the purple star visible at 32px',
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

test('web shell opts into iOS standalone mode', async () => {
  const html = await readFile(new URL('index.html', publicDirectory), 'utf8');

  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="KOSMO" \/>/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="default" \/>/);
});
