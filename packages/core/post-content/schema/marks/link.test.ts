import assert from 'node:assert/strict';
import test from 'node:test';
import { linkMarkSpec } from './link';

const [parseLink] = linkMarkSpec.parseDOM;

test('parses safe absolute HTTP links with a canonical href', () => {
  assert.deepEqual(parseLink.getAttrs(elementWithHref('HTTPS://EXAMPLE.COM:443/path')), {
    href: 'https://example.com/path',
  });
});

test('leaves unsafe HTML link labels unmarked', () => {
  assert.equal(parseLink.getAttrs(elementWithHref('javascript:alert(1)')), false);
});

function elementWithHref(href: string): HTMLElement {
  return { getAttribute: () => href } as unknown as HTMLElement;
}
