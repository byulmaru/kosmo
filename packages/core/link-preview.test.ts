import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('fetches a safe HTML preview and rejects unsafe or unbounded responses', () => {
  const childScript = String.raw`
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mock } from 'node:test';

const dnsResults = new Map();
const requests = [];
const dnsCalls = [];
const responses = [];
const OriginalAbortController = globalThis.AbortController;
let activeAbortController;
let abortOnConstruction = false;
const publicAddresses = [
  { address: '93.184.216.34', family: 4 },
  { address: '2606:4700:4700::1111', family: 6 },
];
function setAddresses(hostname, addresses) {
  dnsResults.set(hostname, addresses);
}
function queueResponse(response) {
  responses.push(response);
}
function createResponse(response) {
  const incoming = new Readable({
    read() {
      if (response.stall) return;
      const body = response.body ?? '';
      this.push(Buffer.isBuffer(body) ? body : Buffer.from(body));
      this.push(null);
    },
  });
  incoming.statusCode = response.statusCode ?? 200;
  incoming.headers = response.headers ?? { 'content-type': 'text/html' };
  return incoming;
}
function request(url, options, callback) {
  const addresses = [];
  const lookup = options.lookup;
  lookup(url.hostname, { all: true }, (error, result) => {
    assert.equal(error, null);
    addresses.push(...result);
  });
  let singleLookup;
  lookup(url.hostname, { all: false }, (error, address, family) => {
    assert.equal(error, null);
    singleLookup = { address, family };
  });
  const record = { url: url.href, options, addresses, singleLookup };
  requests.push(record);

  const req = new EventEmitter();
  req.destroy = () => {
    queueMicrotask(() => req.emit('error', new Error('request cancelled')));
    return req;
  };
  req.end = () => {
    const response = responses.shift();
    if (response === undefined) {
      queueMicrotask(() => req.emit('error', new Error('unexpected request')));
      return;
    }
    queueMicrotask(() => callback(createResponse(response)));
  };
  return req;
}

const originalDns = await import('node:dns');
const originalHttp = await import('node:http');
const originalHttps = await import('node:https');
function mockBuiltin(specifier, original, overrides) {
  mock.module(specifier, {
    exports: {
      ...original,
      ...overrides,
      default: { ...original.default, ...overrides },
    },
  });
}

mockBuiltin('node:dns', originalDns, {
  lookup(hostname, options, callback) {
    dnsCalls.push({ hostname, options });
    const result = dnsResults.get(hostname);
    if (result === null) return;
    if (result === 'reject-later') {
      if (hostname === 'late-dns.example') {
        activeAbortController.abort(new Error('aborted during DNS lookup'));
      }
      queueMicrotask(() => callback(new Error('late DNS rejection')));
      return;
    }
    callback(null, result ?? publicAddresses);
  },
});
mockBuiltin('node:http', originalHttp, { request });
mockBuiltin('node:https', originalHttps, { request });
globalThis.AbortController = class extends OriginalAbortController {
  constructor() {
    super();
    activeAbortController = this;
    if (abortOnConstruction) {
      this.abort(new Error('already aborted'));
    }
  }
};

const { fetchLinkPreview, normalizeLinkPreviewUrl } = await import('./link-preview.ts');
assert.equal(
  normalizeLinkPreviewUrl('HTTPS://EXAMPLE.COM:443?query=1#section'),
  'https://example.com/?query=1#section',
);
for (const invalidUrl of [
  'https://user:password@example.com/',
  'https://example.com:8443/',
  'javascript:alert(1)',
]) {
  assert.equal(normalizeLinkPreviewUrl(invalidUrl), null, invalidUrl);
}

setAddresses('public.example', publicAddresses);
queueResponse({ statusCode: 302, headers: { location: '/final/post' } });
queueResponse({
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: '<meta property="og:title" content="  "><title> HTML title </title>' +
    '<meta property="og:description" content=" "><meta name="description" content="Fallback description">' +
    '<meta property="og:image" content="../images/card.png">' +
    '<script>globalThis.__previewScriptRan = true</script><img src="https://resource.example/image.png">',
});
const originalUrl = 'https://public.example/start';
const preview = await fetchLinkPreview(originalUrl);
assert.deepEqual(preview, {
  url: originalUrl,
  title: 'HTML title',
  description: 'Fallback description',
  imageUrl: 'https://public.example/images/card.png',
});
assert.equal(requests.length, 2);
assert.equal(globalThis.__previewScriptRan, undefined);
assert.deepEqual(requests[0].addresses, publicAddresses);
assert.deepEqual(requests[0].singleLookup, publicAddresses[0]);
assert.equal(requests[0].url, originalUrl);
assert.equal(requests[0].options.headers['Accept-Encoding'], 'identity');
assert.equal(requests[0].options.headers.cookie, undefined);
assert.equal(requests[0].options.headers.authorization, undefined);
assert.equal(dnsCalls.every(({ options }) => options.all === true), true);

queueResponse({
  headers: { 'content-type': 'text/html; charset=utf-8' },
  body: Buffer.from('<title>한글 제목</title>', 'utf8'),
});
assert.equal((await fetchLinkPreview('https://public.example/charset'))?.title, '한글 제목');

queueResponse({
  body: '<meta property="og:title" content=" Open Graph title ">' +
    '<title>Ignored HTML title</title><meta property="og:description" content="Open Graph description">' +
    '<meta name="description" content="Ignored fallback"><meta property="og:image" content="http://10.0.0.4/image.png">',
});
assert.deepEqual(await fetchLinkPreview('https://public.example/article'), {
  url: 'https://public.example/article',
  title: 'Open Graph title',
  description: 'Open Graph description',
  imageUrl: null,
});

queueResponse({
  body: '<title>Blank image</title><meta property="og:image" content="   ">',
});
assert.deepEqual(await fetchLinkPreview('https://public.example/blank-image'), {
  url: 'https://public.example/blank-image',
  title: 'Blank image',
  description: null,
  imageUrl: null,
});

queueResponse({ body: '<meta name="description" content="Description only">' });
assert.equal(await fetchLinkPreview('https://public.example/no-title'), null);

const requestCountBeforeUnsafeUrls = requests.length;
for (const unsafeUrl of [
  'https://user:password@public.example/',
  'https://public.example:8443/',
  'http://127.0.0.1/',
  'http://[::ffff:127.0.0.1]/',
  'https://203.0.113.7/',
]) {
  assert.equal(await fetchLinkPreview(unsafeUrl), null, unsafeUrl);
}
assert.equal(requests.length, requestCountBeforeUnsafeUrls);

setAddresses('mixed.example', [publicAddresses[0], { address: '10.0.0.8', family: 4 }]);
assert.equal(await fetchLinkPreview('https://mixed.example/'), null);
assert.equal(requests.length, requestCountBeforeUnsafeUrls);

queueResponse({ statusCode: 302, headers: { location: 'http://127.0.0.1/private' } });
assert.equal(await fetchLinkPreview('https://public.example/redirect-private'), null);
assert.equal(requests.length, requestCountBeforeUnsafeUrls + 1);

for (let index = 0; index < 4; index++) {
  queueResponse({ statusCode: 302, headers: { location: '/next' } });
}
const requestCountBeforeRedirectLimit = requests.length;
assert.equal(await fetchLinkPreview('https://public.example/redirect-loop'), null);
assert.equal(requests.length - requestCountBeforeRedirectLimit, 4);

queueResponse({ headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' } });
assert.equal(await fetchLinkPreview('https://public.example/encoded'), null);
queueResponse({ body: Buffer.alloc(512 * 1024 + 1) });
assert.equal(await fetchLinkPreview('https://public.example/oversized'), null);

setAddresses('slow-dns.example', null);
assert.equal(await fetchLinkPreview('https://slow-dns.example/'), null);
setAddresses('slow-body.example', publicAddresses);
queueResponse({ stall: true });
assert.equal(await fetchLinkPreview('https://slow-body.example/'), null);

setAddresses('aborted-dns.example', 'reject-later');
const dnsCallsBeforeAbort = dnsCalls.length;
abortOnConstruction = true;
try {
  assert.equal(await fetchLinkPreview('https://aborted-dns.example/'), null);
} finally {
  abortOnConstruction = false;
}
assert.equal(dnsCalls.length, dnsCallsBeforeAbort);

setAddresses('late-dns.example', 'reject-later');
const unhandledRejections = [];
const onUnhandledRejection = (reason) => unhandledRejections.push(reason);
process.on('unhandledRejection', onUnhandledRejection);
try {
  assert.equal(await fetchLinkPreview('https://late-dns.example/'), null);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(unhandledRejections, []);
} finally {
  process.off('unhandledRejection', onUnhandledRejection);
  globalThis.AbortController = OriginalAbortController;
}
`;

  const result = spawnSync(
    process.execPath,
    [
      '--experimental-test-module-mocks',
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      childScript,
    ],
    {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      timeout: 12_000,
    },
  );

  assert.equal(result.error, undefined, result.stderr);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
