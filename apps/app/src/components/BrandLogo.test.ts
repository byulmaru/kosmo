import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { before, mock, test } from 'node:test';
import type { ReactElement } from 'react';

const mockModule = (specifier: string | URL, exports: object) =>
  mock.module(specifier, {
    exports,
  } as unknown as Parameters<typeof mock.module>[1]);

mockModule('react-native', {
  Image: 'Image',
  StyleSheet: { create: <T>(styles: T) => styles },
});

const require = createRequire(import.meta.url);
require.extensions['.png'] = (module, filename) => {
  module.exports = filename;
};

type BrandLogoProps = {
  accessibilityLabel?: string;
  variant?: 'full' | 'mark';
  width: number;
};

type BrandLogoComponent = (props: BrandLogoProps) => ReactElement<Record<string, unknown>, string>;

let BrandLogo: BrandLogoComponent | undefined;

before(async () => {
  const module = await import('./BrandLogo').catch(() => null);
  BrandLogo = module?.BrandLogo as BrandLogoComponent | undefined;
});

async function renderLogo(props: BrandLogoProps) {
  const Logo = BrandLogo;
  assert.ok(Logo, 'BrandLogo component must exist');
  const image = Logo(props);
  assert.equal(String(image.type), 'Image');
  return image;
}

test('mark variant renders the approved mark as a square accessible image', async () => {
  const image = await renderLogo({ width: 56 });

  assert.equal(image.props.accessibilityLabel, 'KOSMO 로고');
  assert.equal(image.props.accessibilityRole, 'image');
  assert.equal(image.props.resizeMode, 'contain');
  assert.match(String((image.props.source as { uri?: string }).uri), /brand-mark-light\.png$/);
  assert.deepEqual((image.props.style as Array<unknown>)[0], { height: 56, width: 56 });
});

test('full variant preserves the approved 1665 by 1050 artboard ratio', async () => {
  const image = await renderLogo({ variant: 'full', width: 166.5 });

  assert.match(String((image.props.source as { uri?: string }).uri), /brand-logo-full-light\.png$/);
  assert.deepEqual((image.props.style as Array<unknown>)[0], {
    aspectRatio: 1665 / 1050,
    width: 166.5,
  });
});
