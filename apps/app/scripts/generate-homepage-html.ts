import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { homepageCopy } from '../src/homepage';

const metadataStart = '<!-- kosmo-share-metadata:start -->';
const metadataEnd = '<!-- kosmo-share-metadata:end -->';
const homepageStyles = `
    <style id="homepage-fallback">
      .homepage-fallback {
        box-sizing: border-box;
        flex: 1;
        margin: 0 auto;
        max-width: 600px;
        padding: 24px 16px;
        width: 100%;
      }

      .homepage-fallback h1 {
        color: CanvasText;
        font: 700 24px/1.25 system-ui, sans-serif;
        margin: 0 0 8px;
      }

      .homepage-fallback p {
        color: CanvasText;
        font: 400 16px/24px system-ui, sans-serif;
        margin: 0;
      }
    </style>`;

function replaceOnce(html: string, before: string, after: string, label: string) {
  const index = html.indexOf(before);
  if (index < 0 || html.indexOf(before, index + before.length) >= 0) {
    throw new Error(`Expected one ${label} in Expo's web shell`);
  }

  return html.slice(0, index) + after + html.slice(index + before.length);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceHomepageMetadata(html: string) {
  const start = html.indexOf(metadataStart);
  const end = html.indexOf(metadataEnd);
  if (
    start < 0 ||
    end < start ||
    html.indexOf(metadataStart, start + metadataStart.length) >= 0 ||
    html.indexOf(metadataEnd, end + metadataEnd.length) >= 0
  ) {
    throw new Error("Expected one ordered homepage metadata block in Expo's web shell");
  }

  let block = html.slice(start + metadataStart.length, end);
  if (block.includes('rel="canonical"')) {
    throw new Error("Expected no canonical link in Expo's generic metadata block");
  }
  for (const [before, after, label] of [
    ['<title>KOSMO</title>', `<title>${escapeHtml(homepageCopy.title)}</title>`, 'title tag'],
    [
      '<meta name="description" content="흩어진 타임라인을 한곳에서." />',
      `<meta name="description" content="${escapeHtml(homepageCopy.description)}" />`,
      'description tag',
    ],
    [
      '<meta property="og:title" content="KOSMO" />',
      `<meta property="og:title" content="${escapeHtml(homepageCopy.title)}" />`,
      'Open Graph title tag',
    ],
    [
      '<meta property="og:description" content="흩어진 타임라인을 한곳에서." />',
      `<meta property="og:description" content="${escapeHtml(homepageCopy.description)}" />`,
      'Open Graph description tag',
    ],
    [
      '<meta name="twitter:title" content="KOSMO" />',
      `<meta name="twitter:title" content="${escapeHtml(homepageCopy.title)}" />`,
      'Twitter title tag',
    ],
    [
      '<meta name="twitter:description" content="흩어진 타임라인을 한곳에서." />',
      `<meta name="twitter:description" content="${escapeHtml(homepageCopy.description)}" />`,
      'Twitter description tag',
    ],
  ]) {
    block = replaceOnce(block, before, after, label);
  }

  block = replaceOnce(
    block,
    '</title>',
    '</title>\n    <link rel="canonical" href="https://kos.moe/" />',
    'homepage title end for canonical link',
  );
  return `${html.slice(0, start + metadataStart.length)}${block}${html.slice(end)}`;
}

function createHomepageHtml(html: string) {
  let result = replaceHomepageMetadata(html);
  result = replaceOnce(result, '</head>', `${homepageStyles}\n  </head>`, 'head closing tag');
  return replaceOnce(
    result,
    '<div id="root"></div>',
    `<div id="root"><main class="homepage-fallback" lang="ko"><h1>${escapeHtml(homepageCopy.brand)}</h1><p>${escapeHtml(homepageCopy.intro)}</p></main></div>`,
    'empty root element',
  );
}

export async function generateHomepageHtml(exportDirectory: string) {
  const sourcePath = path.join(exportDirectory, 'index.html');
  const targetPath = path.join(exportDirectory, 'home.html');
  const html = await readFile(sourcePath, 'utf8');
  await writeFile(targetPath, createHomepageHtml(html));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exportDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
  void generateHomepageHtml(exportDirectory).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
