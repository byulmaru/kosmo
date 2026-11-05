import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  buildLicenseEntries,
  checkLicenseArtifact,
  normalizeRepositoryUrl,
  packageKeysForLicenseCheck,
  sourceSha256,
  writeLicenseArtifact,
} from './generate-app-licenses.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-app-licenses-'));
  const notice = join(root, 'NOTICE.md');
  const supplemental = join(root, 'supplemental.json');
  const pendingFile = join(root, 'apps/app/licenses/pending-notices.json');
  const hopeReLicense = join(root, 'apps/app/licenses/hope-re.LICENSE');
  writeFileSync(notice, 'Complete attribution notice\n');
  writeFileSync(supplemental, '[]\n');
  mkdirSync(dirname(pendingFile), { recursive: true });
  writeFileSync(pendingFile, '[]\n');
  writeFileSync(hopeReLicense, 'Complete Hope:RE MIT license\n');
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
      'Hope:RE@',
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
  assert.deepEqual(
    entries.find((entry) => entry.name === 'Hope:RE'),
    {
      name: 'Hope:RE',
      version: '',
      license: 'MIT',
      text: 'Complete Hope:RE MIT license\n',
      sourceUrl:
        'https://github.com/byulmaru/hope-re/blob/509e641253d84110eaa9dc9c35f4d40810ee7608/LICENSE',
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

test('checks the exact generated package set and notice records', (t) => {
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
    notices: [entry],
  };
  writeLicenseArtifact(generatedData, outputPath);
  const generated = readFileSync(outputPath, 'utf8');
  assert.deepEqual(JSON.parse(generated), generatedData);
  assert.doesNotThrow(() => checkLicenseArtifact(current, outputPath));
  assert.throws(
    () =>
      checkLicenseArtifact(
        { ...current, notices: [entry, { ...entry, name: 'new-package' }] },
        outputPath,
      ),
    /stale package set:[\s\S]*missing from generated data: new-package@1\.0\.0/,
  );
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

  writeLicenseArtifact(
    { ...generatedData, notices: [entry, { ...entry, name: 'pkg-linux' }] },
    outputPath,
  );
  assert.throws(
    () => checkLicenseArtifact(current, outputPath),
    /stale package set:[\s\S]*no longer distributed: pkg-linux/,
  );
});

test('keeps static license notices out of the npm package check scope', () => {
  const keys = packageKeysForLicenseCheck([
    { name: '반응 이모지', version: '', license: 'MIT · Unicode' },
    { name: 'Hope:RE', version: '', license: 'MIT' },
    { name: 'runtime', version: '1.0.0', license: 'MIT' },
  ]);

  assert.deepEqual([...keys], ['runtime@1.0.0']);
});

test('allows blank versions only for the known static license notices', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-license-static-notices-'));
  const outputPath = join(root, 'licenses.json');
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const hopeReNotice = {
    name: 'Hope:RE',
    version: '',
    license: 'MIT',
    text: 'Complete Hope:RE MIT license\n',
    sourceUrl:
      'https://github.com/byulmaru/hope-re/blob/509e641253d84110eaa9dc9c35f4d40810ee7608/LICENSE',
  };
  const current = { sourceSha256: 'a'.repeat(64), notices: [hopeReNotice] };
  writeLicenseArtifact(current, outputPath);
  assert.doesNotThrow(() => checkLicenseArtifact(current, outputPath));

  const unknownNotice = { ...hopeReNotice, name: 'Unknown' };
  writeLicenseArtifact({ ...current, notices: [unknownNotice] }, outputPath);
  assert.throws(
    () => checkLicenseArtifact({ ...current, notices: [unknownNotice] }, outputPath),
    /contains an invalid notice/,
  );

  const wrongLicense = { ...hopeReNotice, license: 'Apache-2.0' };
  writeLicenseArtifact({ ...current, notices: [wrongLicense] }, outputPath);
  assert.throws(
    () => checkLicenseArtifact({ ...current, notices: [wrongLicense] }, outputPath),
    /contains an invalid notice/,
  );
});

test('checks one checksum over lock, supplemental, pending, and static license notice sources', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-license-sources-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sources = [
    'pnpm-lock.yaml',
    'apps/app/licenses/supplemental-families.json',
    'apps/app/licenses/supplemental-other.json',
    'apps/app/licenses/pending-notices.json',
    'apps/app/public/reaction-emoji/NOTICE.md',
    'apps/app/licenses/hope-re.LICENSE',
  ];
  for (const path of sources) {
    const filePath = join(root, path);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${path}\n`);
  }

  const initial = sourceSha256(root);
  writeFileSync(join(root, 'apps/app/licenses/hope-re.LICENSE'), 'changed Hope:RE license\n');
  const changedHopeReLicense = sourceSha256(root);
  assert.notEqual(changedHopeReLicense, initial);
  writeFileSync(
    join(root, 'apps/app/licenses/supplemental-other.json'),
    'changed supplemental content\n',
  );
  const changedSupplement = sourceSha256(root);
  assert.notEqual(changedSupplement, changedHopeReLicense);
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

test('includes selected transitive packages and excludes unshipped build tools', (t) => {
  const { root, notice, supplemental } = fixture(t);
  const runtime = addPackage(root, 'runtime', '1.0.0', 'owner/runtime', {
    LICENSE: 'Runtime license\n',
  });
  const transitive = addPackage(root, 'runtime-transitive', '2.0.0', 'owner/transitive', {
    COPYING: 'Transitive license\n',
  });
  const buildTool = addPackage(root, 'build-tool', '3.0.0', 'owner/build-tool');
  updateManifest(runtime, {
    dependencies: { 'runtime-transitive': '^2.0.0' },
  });
  updateManifest(transitive, {
    dependencies: { 'build-tool': '^3.0.0' },
  });

  const entries = buildLicenseEntries(
    {
      MIT: [
        reportRow('runtime', ['1.0.0'], [runtime]),
        reportRow('runtime-transitive', ['2.0.0'], [transitive]),
        reportRow('build-tool', ['3.0.0'], [buildTool]),
      ],
    },
    {
      root,
      notice,
      supplementalFiles: [supplemental],
      packageKeys: new Set(['runtime@1.0.0', 'runtime-transitive@2.0.0']),
    },
  );
  assert.deepEqual(
    entries.map(({ name, version }) => `${name}@${version}`),
    ['Hope:RE@', 'runtime@1.0.0', 'runtime-transitive@2.0.0', '반응 이모지@'],
  );

  assert.throws(
    () =>
      buildLicenseEntries(
        { MIT: [reportRow('runtime', ['1.0.0'], [runtime])] },
        {
          root,
          notice,
          supplementalFiles: [supplemental],
          packageKeys: new Set(['runtime@1.0.0', 'missing-transitive@4.0.0']),
        },
      ),
    /Selected distribution packages are missing from pnpm production metadata:[\s\S]*missing-transitive@4\.0\.0/,
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
