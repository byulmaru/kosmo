import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { generateHomepageHtml } from '../scripts/generate-homepage-html';

const temporaryDirectories: string[] = [];
const homepageTitle = '코스모 KOSMO | 동인과 서브컬처를 위한 SNS';
const homepageBrand = '코스모 KOSMO';
const homepageIntro = '동인과 서브컬처를 위한 SNS. 좋아하는 작품과 이야기를 나눠보세요.';
const homepageDescription =
  '동인과 서브컬처를 위한 SNS, 코스모 KOSMO. 좋아하는 작품과 이야기를 나눠보세요.';
const exportedShell = `<!doctype html>
<html lang="ko"><head>
<!-- kosmo-share-metadata:start -->
<title>KOSMO</title>
<meta name="description" content="흩어진 타임라인을 한곳에서." />
<meta property="og:title" content="KOSMO" />
<meta property="og:description" content="흩어진 타임라인을 한곳에서." />
<meta name="twitter:title" content="KOSMO" />
<meta name="twitter:description" content="흩어진 타임라인을 한곳에서." />
<!-- kosmo-share-metadata:end -->
<link rel="stylesheet" href="/_expo/static/css/web/style-abc.css" />
<script src="/_expo/static/js/web/main-abc.js" defer></script>
</head><body><noscript>JavaScript required</noscript><div id="root"></div></body></html>`;

after(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('generates a visible, root-specific homepage while preserving the Expo bundle shell', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'kosmo-homepage-'));
  temporaryDirectories.push(directory);
  await writeFile(path.join(directory, 'index.html'), exportedShell);

  await generateHomepageHtml(directory);

  const homepage = await readFile(path.join(directory, 'home.html'), 'utf8');
  assert.equal(await readFile(path.join(directory, 'index.html'), 'utf8'), exportedShell);
  assert.ok(homepage.includes(`<title>${homepageTitle}</title>`));
  assert.ok(homepage.includes('<link rel="canonical" href="https://kos.moe/" />'));
  assert.ok(homepage.includes(`<meta name="description" content="${homepageDescription}" />`));
  assert.ok(homepage.includes(`<meta property="og:title" content="${homepageTitle}" />`));
  assert.ok(
    homepage.includes(`<meta property="og:description" content="${homepageDescription}" />`),
  );
  assert.ok(homepage.includes(`<meta name="twitter:title" content="${homepageTitle}" />`));
  assert.ok(
    homepage.includes(`<meta name="twitter:description" content="${homepageDescription}" />`),
  );
  assert.ok(homepage.includes(`<h1>${homepageBrand}</h1><p>${homepageIntro}</p>`));
  assert.match(homepage, /href="\/_expo\/static\/css\/web\/style-abc\.css"/);
  assert.match(homepage, /src="\/_expo\/static\/js\/web\/main-abc\.js"/);
  assert.match(homepage, /<noscript>JavaScript required<\/noscript>/);
});

test('rejects an incomplete Expo shell without writing a homepage file', async (context) => {
  const invalidShells = [
    {
      name: 'missing metadata',
      html: exportedShell.replace('<meta name="twitter:title" content="KOSMO" />\n', ''),
      error: /Expected one Twitter title tag/,
    },
    {
      name: 'missing root element',
      html: exportedShell.replace('<div id="root"></div>', '<div id="application"></div>'),
      error: /Expected one empty root element/,
    },
  ];

  for (const { name, html, error } of invalidShells) {
    await context.test(name, async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'kosmo-homepage-invalid-'));
      temporaryDirectories.push(directory);
      await writeFile(path.join(directory, 'index.html'), html);

      await assert.rejects(generateHomepageHtml(directory), error);
      await assert.rejects(readFile(path.join(directory, 'home.html')), { code: 'ENOENT' });
    });
  }
});
