import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildLicenseEntries,
  checkLicenseArtifact,
  normalizeRepositoryUrl,
  sourceSha256,
  writeLicenseArtifact,
} from './generate-app-licenses.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-app-licenses-'));
  const notice = join(root, 'NOTICE.md');
  const supplemental = join(root, 'supplemental.json');
  const pendingFile = join(root, 'apps/app/licenses/pending-notices.json');
  writeFileSync(notice, 'Complete attribution notice\n');
  writeFileSync(supplemental, '[]\n');
  mkdirSync(dirname(pendingFile), { recursive: true });
  writeFileSync(pendingFile, '[]\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, notice, supplemental, pendingFile };
}

function addPackage(root, name, version, repository, files = {}, baseDirectory = 'fixtures') {
  const packagePath =
    baseDirectory === 'node_modules'
      ? join(root, baseDirectory, name)
      : join(root, baseDirectory, name.replaceAll('/', '__'), version);
  mkdirSync(packagePath, { recursive: true });
  writeFileSync(
    join(packagePath, 'package.json'),
    `${JSON.stringify({
      name,
      version,
      license: 'MIT',
      ...(repository && { repository }),
    })}\n`,
  );
  for (const [filename, text] of Object.entries(files)) {
    mkdirSync(dirname(join(packagePath, filename)), { recursive: true });
    writeFileSync(join(packagePath, filename), text);
  }
  return packagePath;
}

function reportRow(name, versions, paths, license = 'MIT') {
  return { name, versions, paths, license };
}

function updateManifest(packagePath, updates) {
  const manifestPath = join(packagePath, 'package.json');
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...JSON.parse(readFileSync(manifestPath, 'utf8')), ...updates })}\n`,
  );
}

function linkInstalledPackage(root, name, packagePath) {
  const linkPath = join(root, 'node_modules', ...name.split('/'));
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(packagePath, linkPath, 'dir');
}

test('reports pnpm license failures written to stdout and stderr', (t) => {
  const binDirectory = mkdtempSync(join(tmpdir(), 'kosmo-app-licenses-pnpm-'));
  t.after(() => rmSync(binDirectory, { recursive: true, force: true }));
  const pnpmPath = join(binDirectory, 'pnpm');
  writeFileSync(
    pnpmPath,
    `#!/bin/sh
cat <<'JSON'
{"error":{"code":"ERR_PNPM_MISSING_PACKAGE_INDEX_FILE","message":"package index missing"}}
JSON
printf '%s\\n' 'pnpm stderr diagnostic' >&2
exit 1
`,
  );
  chmodSync(pnpmPath, 0o755);

  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('./generate-app-licenses.mjs', import.meta.url)), '--check'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ''}` },
    },
  );

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /"code":"ERR_PNPM_MISSING_PACKAGE_INDEX_FILE"/);
  assert.match(result.stderr, /"message":"package index missing"/);
  assert.match(result.stderr, /pnpm stderr diagnostic/);
});

test('builds sorted package entries from local originals and exact supplements', (t) => {
  const { root, notice, supplemental } = fixture(t);
  const plainV2 = addPackage(root, 'plain', '2.0.0', 'git+ssh://git@github.com/example/plain.git', {
    'LICENSE-MIT': 'Copyright 2025 Example\nMIT body\n',
    'COPYING.LESSER': 'Secondary terms\n',
    'nested/LICENSE': 'must not be read',
  });
  const plainV1 = addPackage(root, 'plain', '1.0.0', 'example/plain', {
    LICENSE: 'Original MIT text\n',
  });
  const fallback = addPackage(
    root,
    '@scope/fallback',
    '3.0.0',
    { url: 'https://gitlab.com/example/fallback.git#readme' },
    { 'NOTICE.md': 'Package notice\n' },
  );
  const publishedKosmo = addPackage(
    root,
    '@kosmo/published',
    '1.0.0',
    'git@github.com:byulmaru/published.git',
    { LICENSE: 'Published package license\n' },
    'node_modules',
  );
  const localKosmo = join(root, 'packages', 'core');
  mkdirSync(localKosmo, { recursive: true });
  writeFileSync(
    join(localKosmo, 'package.json'),
    JSON.stringify({ name: '@kosmo/core', version: '1.0.0' }),
  );
  const supplemented = addPackage(
    root,
    'supplemented',
    '4.0.0',
    'https://github.com/example/supplemented.git',
  );
  const supplementalText = 'Copyright 2024 Example\nComplete upstream terms\n';
  writeFileSync(
    supplemental,
    `${JSON.stringify([
      {
        packages: ['@scope/fallback@3.0.0'],
        license: 'MIT',
        sourceUrl: 'https://gitlab.com/example/fallback/blob/abcdef/LICENSE',
        text: 'Full upstream license\n',
      },
      {
        packages: ['supplemented@4.0.0'],
        license: 'MIT',
        sourceUrl: 'https://github.com/example/supplemented/blob/0123456789abcdef/LICENSE',
        text: supplementalText,
      },
    ])}\n`,
  );

  const entries = buildLicenseEntries(
    {
      MIT: [
        reportRow('plain', ['2.0.0', '1.0.0'], [plainV2, plainV1]),
        reportRow('@scope/fallback', ['3.0.0'], [fallback]),
        reportRow('@kosmo/published', ['1.0.0'], [publishedKosmo]),
        reportRow('@kosmo/core', ['1.0.0'], [localKosmo]),
        reportRow('supplemented', ['4.0.0'], [supplemented]),
      ],
    },
    { root, notice, supplementalFiles: [supplemental] },
  );

  assert.deepEqual(
    entries.map(({ name, version }) => `${name}@${version}`),
    [
      '@kosmo/published@1.0.0',
      '@scope/fallback@3.0.0',
      'plain@1.0.0',
      'plain@2.0.0',
      'supplemented@4.0.0',
      '반응 이모지@',
    ],
  );
  assert.equal(
    entries.find((entry) => entry.version === '2.0.0').text,
    '--- COPYING.LESSER ---\nSecondary terms\n\n--- LICENSE-MIT ---\nCopyright 2025 Example\nMIT body\n',
  );
  assert.equal(
    entries.find((entry) => entry.version === '1.0.0' && entry.name === 'plain').text,
    'Original MIT text\n',
  );
  assert.equal(
    entries.find((entry) => entry.name === '@kosmo/published').sourceUrl,
    'https://github.com/byulmaru/published',
  );
  assert.equal(
    entries.find((entry) => entry.name === '@scope/fallback').sourceUrl,
    'https://gitlab.com/example/fallback/blob/abcdef/LICENSE',
  );
  assert.equal(
    entries.find((entry) => entry.name === '@scope/fallback').text,
    '--- LICENSE (supplemental) ---\nFull upstream license\n\n--- NOTICE.md ---\nPackage notice\n',
  );
  assert.deepEqual(
    entries.find((entry) => entry.name === 'supplemented'),
    {
      name: 'supplemented',
      version: '4.0.0',
      license: 'MIT',
      text: supplementalText,
      sourceUrl: 'https://github.com/example/supplemented/blob/0123456789abcdef/LICENSE',
    },
  );
  assert.equal(entries.at(-1).text, 'Complete attribution notice\n');
  assert.ok(
    entries.every((entry) => Object.values(entry).every((value) => typeof value === 'string')),
  );
});

test('requires original text and rejects metadata mismatches', (t) => {
  const { root, notice, supplemental } = fixture(t);
  const noLicense = addPackage(root, 'missing', '1.0.0', 'owner/missing');
  const options = { root, notice, supplementalFiles: [supplemental] };
  assert.throws(
    () => buildLicenseEntries({ MIT: [reportRow('missing', ['1.0.0'], [noLicense])] }, options),
    /Missing original license text.*missing@1\.0\.0 \(MIT\)/s,
  );

  writeFileSync(
    supplemental,
    `${JSON.stringify([
      {
        packages: ['missing@1.0.0'],
        license: 'Apache-2.0',
        sourceUrl: 'https://github.com/owner/missing/blob/abcdef/LICENSE',
        text: 'Original text',
      },
    ])}\n`,
  );
  assert.throws(
    () => buildLicenseEntries({ MIT: [reportRow('missing', ['1.0.0'], [noLicense])] }, options),
    /Supplemental license does not match pnpm metadata/,
  );
});

test('keeps only exact pending package versions with an empty original text', (t) => {
  const { root, notice, supplemental, pendingFile } = fixture(t);
  const pkg = addPackage(root, 'pending', '1.0.0');
  const report = { MIT: [reportRow('pending', ['1.0.0'], [pkg])] };
  writeFileSync(
    pendingFile,
    `${JSON.stringify([
      {
        package: 'pending@1.0.0',
        license: 'MIT',
        reason: 'No published copyright notice was found in the examined original sources.',
        evidenceUrls: ['https://www.npmjs.com/package/pending/v/1.0.0'],
      },
    ])}\n`,
  );

  const entries = buildLicenseEntries(report, { root, notice, supplementalFiles: [supplemental] });
  assert.deepEqual(
    entries.find((entry) => entry.name === 'pending'),
    {
      name: 'pending',
      version: '1.0.0',
      license: 'MIT',
      text: '',
      sourceUrl: 'https://www.npmjs.com/package/pending/v/1.0.0',
    },
  );
  const outputPath = join(root, 'open-source-licenses.json');
  const pendingData = {
    sourceSha256: 'a'.repeat(64),
    notices: [entries.find((entry) => entry.name === 'pending')],
  };
  writeLicenseArtifact(pendingData, outputPath);
  assert.doesNotThrow(() => checkLicenseArtifact(pendingData, outputPath, pendingFile));

  writeFileSync(
    pendingFile,
    `${JSON.stringify([
      {
        package: 'pending@1.0.0',
        license: 'Apache-2.0',
        reason: 'No published copyright notice was found in the examined original sources.',
        evidenceUrls: ['https://www.npmjs.com/package/pending/v/1.0.0'],
      },
    ])}\n`,
  );
  assert.throws(
    () => checkLicenseArtifact(pendingData, outputPath, pendingFile),
    /contains an invalid notice/,
  );
  assert.throws(
    () => buildLicenseEntries(report, { root, notice, supplementalFiles: [supplemental] }),
    /Pending license does not match pnpm metadata for pending@1\.0\.0/,
  );
});

test('rejects mismatched version paths and conflicting supplement duplicates', (t) => {
  const { root, notice, supplemental } = fixture(t);
  const pkg = addPackage(root, 'pkg', '1.0.0', undefined, {
    LICENSE: 'Original text',
  });
  const options = { root, notice, supplementalFiles: [supplemental] };
  assert.throws(
    () => buildLicenseEntries({ MIT: [reportRow('pkg', ['2.0.0'], [pkg])] }, options),
    /did not match pkg@2\.0\.0/,
  );

  writeFileSync(
    supplemental,
    `${JSON.stringify([
      {
        packages: ['pkg@1.0.0'],
        license: 'MIT',
        sourceUrl: 'https://github.com/example/pkg/blob/abcdef/LICENSE',
        text: 'First text',
      },
      {
        packages: ['pkg@1.0.0'],
        license: 'MIT',
        sourceUrl: 'https://github.com/example/pkg/blob/abcdef/LICENSE',
        text: 'Different text',
      },
    ])}\n`,
  );
  assert.throws(
    () => buildLicenseEntries({ MIT: [reportRow('pkg', ['1.0.0'], [pkg])] }, options),
    /Conflicting supplemental license entries for pkg@1\.0\.0/,
  );
});

test('checks the installed subset against committed all-platform data', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-license-output-'));
  const outputPath = join(root, 'data/licenses.json');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const entry = {
    name: 'pkg',
    version: '1.0.0',
    license: 'MIT',
    text: 'Full text',
    sourceUrl: 'https://github.com/example/pkg',
  };
  const current = {
    sourceSha256: 'a'.repeat(64),
    notices: [entry],
  };
  const generatedData = {
    sourceSha256: current.sourceSha256,
    notices: [entry, { ...entry, name: 'pkg-linux' }],
  };
  writeLicenseArtifact(generatedData, outputPath);
  const generated = readFileSync(outputPath, 'utf8');
  assert.equal(generated, `${JSON.stringify(generatedData, null, 2)}\n`);
  assert.doesNotThrow(() => checkLicenseArtifact(current, outputPath));
  assert.throws(
    () => checkLicenseArtifact({ ...current, sourceSha256: 'b'.repeat(64) }, outputPath),
    /stale for pnpm-lock\.yaml/,
  );
  assert.throws(
    () =>
      checkLicenseArtifact({ ...current, notices: [{ ...entry, text: 'changed' }] }, outputPath),
    /stale for pkg@1\.0\.0/,
  );
  assert.equal(readFileSync(outputPath, 'utf8'), generated);
});

test('checks one checksum over lock, supplemental, pending, and emoji notice sources', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-license-sources-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sources = [
    'pnpm-lock.yaml',
    'apps/app/licenses/supplemental-families.json',
    'apps/app/licenses/supplemental-other.json',
    'apps/app/licenses/pending-notices.json',
    'apps/app/public/reaction-emoji/NOTICE.md',
  ];
  for (const path of sources) {
    const filePath = join(root, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${path}\n`);
  }

  const initial = sourceSha256(root);
  writeFileSync(
    join(root, 'apps/app/licenses/supplemental-other.json'),
    'changed supplemental content\n',
  );
  const changedSupplement = sourceSha256(root);
  assert.notEqual(changedSupplement, initial);
  writeFileSync(join(root, 'apps/app/licenses/pending-notices.json'), 'changed pending content\n');
  assert.notEqual(sourceSha256(root), changedSupplement);
});

test('NOTICE-only packages require a full license supplement', (t) => {
  const { root, notice, supplemental } = fixture(t);
  const packagePath = addPackage(root, 'notice-only', '1.0.0', 'owner/notice-only', {
    'NOTICE.md': 'Copyright 2020 Example\n',
  });
  const report = {
    MIT: [reportRow('notice-only', ['1.0.0'], [packagePath])],
  };
  const options = { root, notice, supplementalFiles: [supplemental] };
  assert.throws(
    () => buildLicenseEntries(report, options),
    /Missing original license text.*notice-only@1\.0\.0 \(MIT\)/s,
  );

  writeFileSync(
    supplemental,
    `${JSON.stringify([
      {
        packages: ['notice-only@1.0.0'],
        license: 'MIT',
        sourceUrl: 'https://github.com/owner/notice-only/blob/abcdef/LICENSE',
        text: 'Full license text\n',
      },
    ])}\n`,
  );
  assert.equal(
    buildLicenseEntries(report, options).find((entry) => entry.name === 'notice-only').text,
    '--- LICENSE (supplemental) ---\nFull license text\n\n--- NOTICE.md ---\nCopyright 2020 Example\n',
  );
});

test('adds forced-installed optional variants and their dependency closure', (t) => {
  const { root, notice, supplemental } = fixture(t);
  const parent = addPackage(root, 'parent', '1.0.0', 'owner/parent', {
    LICENSE: 'Parent license\n',
  });
  const variant = addPackage(
    root,
    '@vendor/platform',
    '1.0.0',
    'git+https://github.com/vendor/platform.git',
    { LICENSE: 'Platform license\n' },
  );
  const transitive = addPackage(root, 'transitive', '2.0.0', 'owner/transitive', {
    COPYING: 'Transitive license\n',
  });
  updateManifest(parent, {
    optionalDependencies: { '@vendor/platform': '1.0.0' },
  });
  updateManifest(variant, {
    dependencies: { transitive: '^2.0.0', 'missing-optional': '1.0.0' },
    optionalDependencies: { 'missing-optional': '1.0.0' },
  });
  linkInstalledPackage(root, '@vendor/platform', variant);
  linkInstalledPackage(root, 'transitive', transitive);

  const entries = buildLicenseEntries(
    { MIT: [reportRow('parent', ['1.0.0'], [parent])] },
    {
      root,
      notice,
      supplementalFiles: [supplemental],
      strictOptionalDependencies: false,
    },
  );
  assert.deepEqual(
    entries.map(({ name }) => name),
    ['@vendor/platform', 'parent', 'transitive', '반응 이모지'],
  );
  assert.equal(
    entries.find((entry) => entry.name === '@vendor/platform').sourceUrl,
    'https://github.com/vendor/platform',
  );

  const missingRoot = mkdtempSync(join(tmpdir(), 'kosmo-license-optional-'));
  t.after(() => rmSync(missingRoot, { recursive: true, force: true }));
  const missingNotice = join(missingRoot, 'NOTICE.md');
  const missingSupplemental = join(missingRoot, 'supplemental.json');
  const missingPending = join(missingRoot, 'apps/app/licenses/pending-notices.json');
  writeFileSync(missingNotice, 'Notice\n');
  writeFileSync(missingSupplemental, '[]\n');
  mkdirSync(dirname(missingPending), { recursive: true });
  writeFileSync(missingPending, '[]\n');
  const missingParent = addPackage(missingRoot, 'missing-parent', '1.0.0', 'owner/missing-parent', {
    LICENSE: 'Parent license\n',
  });
  updateManifest(missingParent, {
    optionalDependencies: { '@vendor/missing': '1.0.0' },
  });
  const missingReport = {
    MIT: [reportRow('missing-parent', ['1.0.0'], [missingParent])],
  };
  assert.doesNotThrow(() =>
    buildLicenseEntries(missingReport, {
      root: missingRoot,
      notice: missingNotice,
      supplementalFiles: [missingSupplemental],
      pendingFile: missingPending,
      strictOptionalDependencies: false,
    }),
  );
  assert.throws(
    () =>
      buildLicenseEntries(missingReport, {
        root: missingRoot,
        notice: missingNotice,
        supplementalFiles: [missingSupplemental],
        pendingFile: missingPending,
      }),
    /missing-parent@1\.0\.0 -> @vendor\/missing \(optional\)/,
  );
});

test('normalizes repository links and falls back to the npm version page', () => {
  assert.equal(
    normalizeRepositoryUrl('github:example/library.git', 'library', '1.2.3'),
    'https://github.com/example/library',
  );
  assert.equal(
    normalizeRepositoryUrl(undefined, '@example/library', '1.2.3'),
    'https://www.npmjs.com/package/@example/library/v/1.2.3',
  );
});
