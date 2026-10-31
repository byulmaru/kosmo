import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = join(workspaceRoot, 'apps/app/src/data/open-source-licenses.json');
const noticeRelativePath = 'apps/app/public/reaction-emoji/NOTICE.md';
const pendingRelativePath = 'apps/app/licenses/pending-notices.json';
const noticePath = join(workspaceRoot, noticeRelativePath);
const pendingPath = join(workspaceRoot, pendingRelativePath);
const noticeEntry = {
  name: '반응 이모지',
  version: '',
  license: 'MIT · Unicode',
  sourceUrl: 'https://github.com/byulmaru/kosmo/blob/main/apps/app/public/reaction-emoji/NOTICE.md',
};
const supplementalPaths = [
  'apps/app/licenses/supplemental-families.json',
  'apps/app/licenses/supplemental-other.json',
];
const licenseFileName = /^(?:license|licence|copying)(?:[._ -].*)?$/i;
const noticeFileName = /^notice(?:[._ -].*)?$/i;

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function npmVersionUrl(name, version) {
  const packagePath = name
    .split('/')
    .map((part) => encodeURIComponent(part).replace(/^%40/i, '@'))
    .join('/');
  return `https://www.npmjs.com/package/${packagePath}/v/${encodeURIComponent(version)}`;
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function normalizeRepositoryUrl(repository, name, version) {
  let value = typeof repository === 'string' ? repository : repository?.url;
  if (typeof value !== 'string' || !value.trim()) {
    return npmVersionUrl(name, version);
  }

  value = value.trim();
  const shorthand = /^(github|gitlab|bitbucket):(.+)$/i.exec(value);
  if (shorthand) {
    const host = {
      bitbucket: 'bitbucket.org',
      github: 'github.com',
      gitlab: 'gitlab.com',
    }[shorthand[1].toLowerCase()];
    value = `https://${host}/${shorthand[2]}`;
  } else {
    const scp = /^git@([^:]+):(.+)$/.exec(value);
    const bareHostPath = /^(github\.com|gitlab\.com|bitbucket\.org)\/(.+)$/i.exec(value);
    const ownerRepo = /^[^/:\s]+\/[^/:\s]+(?:\.git)?$/i.test(value);
    if (scp) {
      value = `https://${scp[1]}/${scp[2]}`;
    } else if (bareHostPath) {
      value = `https://${value}`;
    } else if (ownerRepo) {
      value = `https://github.com/${value}`;
    }
  }

  value = value.replace(/^git\+/i, '');
  try {
    const url = new URL(value);
    if (!url.hostname || url.protocol === 'file:') {
      return npmVersionUrl(name, version);
    }

    const path = url.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
    return `https://${url.host}${path}`;
  } catch {
    return npmVersionUrl(name, version);
  }
}

function compareFileNames(left, right) {
  return (
    compare(left.name.toLowerCase(), right.name.toLowerCase()) || compare(left.name, right.name)
  );
}

function readPackageLicenseDocuments(packagePath) {
  const files = readdirSync(packagePath, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() && (licenseFileName.test(entry.name) || noticeFileName.test(entry.name)),
    )
    .map((entry) => {
      const filePath = join(packagePath, entry.name);
      const text = readFileSync(filePath, 'utf8');
      if (!text.trim()) {
        return null;
      }
      return { name: entry.name, text };
    })
    .filter(Boolean)
    .sort(compareFileNames);

  return {
    licenses: files.filter(({ name }) => licenseFileName.test(name)),
    notices: files.filter(({ name }) => noticeFileName.test(name)),
  };
}

function formatLicenseDocuments(files) {
  if (files.length < 2) {
    return files[0]?.text ?? '';
  }
  return files.map(({ name, text }) => `--- ${name} ---\n${text}`).join('\n');
}

function packageLicenseText({ licenses, notices }, supplement) {
  let licenseDocuments = licenses;
  if (!licenseDocuments.length && supplement) {
    licenseDocuments = [{ name: 'LICENSE (supplemental)', text: supplement.text }];
  }
  if (!licenseDocuments.length) {
    return '';
  }

  const distinctNotices = notices.filter(
    (notice) => !licenseDocuments.some(({ text }) => text.includes(notice.text)),
  );
  return formatLicenseDocuments([...licenseDocuments, ...distinctNotices]);
}

function readSupplementalLicenses(paths) {
  const licenses = new Map();
  for (const path of paths) {
    let contents;
    try {
      contents = readFileSync(path, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const entries = JSON.parse(contents);
    if (!Array.isArray(entries)) {
      throw new Error(`${path} must contain a JSON array.`);
    }
    for (const entry of entries) {
      if (
        !Array.isArray(entry.packages) ||
        !entry.packages.every((key) => typeof key === 'string') ||
        typeof entry.license !== 'string' ||
        !isHttpsUrl(entry.sourceUrl) ||
        typeof entry.text !== 'string' ||
        !entry.text
      ) {
        throw new Error(`${path} contains an invalid supplemental license entry.`);
      }

      for (const key of entry.packages) {
        const match = /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/.exec(key);
        if (!match) {
          throw new Error(`${path} contains an invalid package key: ${key}`);
        }
        const supplement = {
          name: match[1],
          version: match[2],
          license: entry.license,
          sourceUrl: entry.sourceUrl,
          text: entry.text,
        };
        const existing = licenses.get(key);
        if (
          existing &&
          (existing.license !== supplement.license ||
            existing.sourceUrl !== supplement.sourceUrl ||
            existing.text !== supplement.text)
        ) {
          throw new Error(`Conflicting supplemental license entries for ${key}`);
        }
        licenses.set(key, supplement);
      }
    }
  }
  return licenses;
}

function readPendingNotices(path) {
  const entries = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(entries)) {
    throw new Error(`${path} must contain a JSON array.`);
  }

  const pending = new Map();
  for (const entry of entries) {
    const match =
      entry && typeof entry.package === 'string'
        ? /^(@[^/]+\/[^@]+|[^@]+)@(.+)$/.exec(entry.package)
        : null;
    if (
      !match ||
      typeof entry.license !== 'string' ||
      !entry.license ||
      typeof entry.reason !== 'string' ||
      !entry.reason.trim() ||
      !Array.isArray(entry.evidenceUrls) ||
      !entry.evidenceUrls.length ||
      !entry.evidenceUrls.every(isHttpsUrl)
    ) {
      throw new Error(`${path} contains an invalid pending license notice.`);
    }
    if (pending.has(entry.package)) {
      throw new Error(`${path} contains a duplicate pending package: ${entry.package}`);
    }
    pending.set(entry.package, {
      name: match[1],
      version: match[2],
      license: entry.license,
    });
  }
  return pending;
}

function isWorkspacePackage(name, packagePath, packageManifestPath, root) {
  if (!name.startsWith('@kosmo/')) {
    return false;
  }
  const resolvedPath = realpathSync(packagePath);
  const relativePath = relative(realpathSync(root), resolvedPath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes('node_modules')
  ) {
    return false;
  }
  return packageManifestPath.name === name;
}

function resolveInstalledPackage(parentPath, dependencyName) {
  const searchPaths =
    createRequire(join(parentPath, 'package.json')).resolve.paths(dependencyName) ?? [];
  for (const searchPath of searchPaths) {
    const packagePath = join(searchPath, ...dependencyName.split('/'));
    const manifestPath = join(packagePath, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (typeof manifest.name === 'string' && typeof manifest.version === 'string') {
      return { manifest, packagePath };
    }
  }
  return null;
}

function packageLicense(manifest, name, version) {
  if (typeof manifest.license === 'string') {
    return manifest.license;
  }
  if (typeof manifest.license?.type === 'string') {
    return manifest.license.type;
  }
  throw new Error(`Missing string license metadata for ${name}@${version}`);
}

function addLicensePackage(records, packageInfo, root) {
  const { manifest, packagePath } = packageInfo;
  if (isWorkspacePackage(manifest.name, packagePath, manifest, root)) {
    return null;
  }
  const key = `${manifest.name}@${manifest.version}`;
  const existing = records.get(key);
  if (existing) {
    if (existing.license !== packageInfo.license) {
      throw new Error(`Conflicting license metadata for ${key}`);
    }
    return null;
  }
  const record = {
    name: manifest.name,
    version: manifest.version,
    license: packageInfo.license,
    manifest,
    packagePath,
  };
  records.set(key, record);
  return record;
}

function expandOptionalPackages(records, root, strictOptionalDependencies) {
  const pending = [];
  const missing = [];
  const addDependency = (parent, dependencyName, { optional = false } = {}) => {
    const resolved = resolveInstalledPackage(parent.packagePath, dependencyName);
    if (!resolved) {
      if (!optional || strictOptionalDependencies) {
        missing.push(
          `${parent.name}@${parent.version} -> ${dependencyName}${optional ? ' (optional)' : ''}`,
        );
      }
      return;
    }
    const license = packageLicense(
      resolved.manifest,
      resolved.manifest.name,
      resolved.manifest.version,
    );
    const record = addLicensePackage(records, { ...resolved, license }, root);
    if (record) {
      pending.push(record);
    }
  };

  for (const parent of [...records.values()]) {
    for (const dependencyName of Object.keys(parent.manifest.optionalDependencies ?? {})) {
      addDependency(parent, dependencyName, { optional: true });
    }
  }

  for (let index = 0; index < pending.length; index += 1) {
    const parent = pending[index];
    const dependencies = new Map(
      Object.keys(parent.manifest.dependencies ?? {}).map((name) => [name, false]),
    );
    for (const name of Object.keys(parent.manifest.optionalDependencies ?? {})) {
      dependencies.set(name, true);
    }
    for (const [dependencyName, optional] of dependencies) {
      addDependency(parent, dependencyName, { optional });
    }
  }

  if (missing.length) {
    throw new Error(
      `Could not resolve installed package edges after pnpm synchronization:\n${[
        ...new Set(missing),
      ]
        .sort(compare)
        .map((edge) => `- ${edge}`)
        .join(
          '\n',
        )}\nRun pnpm --filter @kosmo/app licenses:generate to synchronize platform packages.`,
    );
  }
}

export function collectLicensePackages(
  report,
  { root = workspaceRoot, strictOptionalDependencies = true } = {},
) {
  const records = new Map();
  for (const [licenseKey, packages] of Object.entries(report)) {
    for (const packageInfo of packages) {
      if (
        !Array.isArray(packageInfo.versions) ||
        !Array.isArray(packageInfo.paths) ||
        packageInfo.versions.length !== packageInfo.paths.length
      ) {
        throw new Error(
          `pnpm license metadata has mismatched versions and paths for ${packageInfo.name}`,
        );
      }

      for (const [index, version] of packageInfo.versions.entries()) {
        const packagePath = packageInfo.paths[index];
        const manifest = JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8'));
        if (manifest.name !== packageInfo.name || manifest.version !== version) {
          throw new Error(`pnpm license metadata did not match ${packageInfo.name}@${version}`);
        }
        const license = packageInfo.license ?? licenseKey;
        if (typeof license !== 'string') {
          throw new Error(
            `pnpm did not provide a string license for ${packageInfo.name}@${version}`,
          );
        }
        addLicensePackage(records, { manifest, packagePath, license }, root);
      }
    }
  }
  expandOptionalPackages(records, root, strictOptionalDependencies);
  return [...records.values()];
}

export function buildLicenseEntries(
  report,
  {
    root = workspaceRoot,
    notice = noticePath,
    supplementalFiles = supplementalPaths.map((path) => join(root, path)),
    pendingFile = join(root, pendingRelativePath),
    strictOptionalDependencies = true,
  } = {},
) {
  const supplemental = readSupplementalLicenses(supplementalFiles);
  const pending = readPendingNotices(pendingFile);
  const missingText = [];

  const entries = [];
  for (const { name, version, license, manifest, packagePath } of collectLicensePackages(report, {
    root,
    strictOptionalDependencies,
  })) {
    const documents = readPackageLicenseDocuments(packagePath);
    let text;
    let sourceUrl = normalizeRepositoryUrl(manifest.repository, name, version);
    const key = `${name}@${version}`;
    const supplement = supplemental.get(key);
    const pendingNotice = pending.get(key);
    if (pendingNotice && pendingNotice.license !== license) {
      throw new Error(
        `Pending license does not match pnpm metadata for ${key}: ${pendingNotice.license} != ${license}`,
      );
    }
    if (supplement) {
      if (supplement.license !== license) {
        throw new Error(
          `Supplemental license does not match pnpm metadata for ${key}: ${supplement.license} != ${license}`,
        );
      }
      if (!documents.licenses.length) {
        text = packageLicenseText(documents, supplement);
        sourceUrl = supplement.sourceUrl;
      }
    }
    if (text === undefined) {
      text = packageLicenseText(documents);
    }
    if (!text) {
      if (!pendingNotice) {
        missingText.push(`${key} (${license})`);
        continue;
      }
      text = '';
    }

    entries.push({
      name,
      version,
      license,
      text,
      sourceUrl,
    });
  }

  if (missingText.length) {
    throw new Error(
      `Missing original license text for ${missingText.length} production package versions:\n${missingText
        .sort(compare)
        .map((key) => `- ${key}`)
        .join(
          '\n',
        )}\nAdd verified full texts to apps/app/licenses/supplemental-families.json or supplemental-other.json.`,
    );
  }

  const noticeText = readFileSync(notice, 'utf8');
  const allEntries = [...entries, { ...noticeEntry, text: noticeText }];
  return allEntries.sort(
    (left, right) => compare(left.name, right.name) || compare(left.version, right.version),
  );
}

export function sourceSha256(root = workspaceRoot) {
  const sourcePaths = [
    'pnpm-lock.yaml',
    ...supplementalPaths,
    pendingRelativePath,
    noticeRelativePath,
  ];
  const sources = sourcePaths.map((path) => {
    const contents = readFileSync(join(root, path), 'utf8');
    return [path, path === 'pnpm-lock.yaml' ? contents.replace(/\r\n/g, '\n') : contents];
  });
  return createHash('sha256').update(JSON.stringify(sources)).digest('hex');
}

export function buildLicenseData(report, options = {}) {
  const root = options.root ?? workspaceRoot;
  return {
    sourceSha256: sourceSha256(root),
    notices: buildLicenseEntries(report, options),
  };
}

function entryKey(entry) {
  return `${entry.name}@${entry.version}`;
}

function sameNotice(left, right) {
  return ['name', 'version', 'license', 'text', 'sourceUrl'].every(
    (key) => left[key] === right[key],
  );
}

export function checkLicenseArtifact(current, outputPath, pendingFile = pendingPath) {
  let committed;
  try {
    committed = JSON.parse(readFileSync(outputPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    throw new Error(
      'Generated app license data is missing. Run pnpm --filter @kosmo/app licenses:generate.',
    );
  }
  if (
    !committed ||
    typeof committed !== 'object' ||
    typeof committed.sourceSha256 !== 'string' ||
    !Array.isArray(committed.notices)
  ) {
    throw new Error(
      'Generated app license data has an invalid shape. Run pnpm --filter @kosmo/app licenses:generate.',
    );
  }
  if (committed.sourceSha256 !== current.sourceSha256) {
    throw new Error(
      'Generated app license data is stale for pnpm-lock.yaml, supplemental license texts, pending notices, or the app notice. Run pnpm --filter @kosmo/app licenses:generate.',
    );
  }

  const pending = readPendingNotices(pendingFile);
  const committedByKey = new Map();
  for (const entry of committed.notices) {
    if (
      !entry ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      !['name', 'version', 'license', 'text', 'sourceUrl'].every(
        (field) => typeof entry[field] === 'string',
      ) ||
      !entry.name ||
      !entry.license ||
      (entry.text.trim() === '' && pending.get(entryKey(entry))?.license !== entry.license) ||
      !isHttpsUrl(entry.sourceUrl)
    ) {
      throw new Error(
        'Generated app license data contains an invalid notice. Run pnpm --filter @kosmo/app licenses:generate.',
      );
    }
    const key = entryKey(entry);
    if (committedByKey.has(key)) {
      throw new Error(
        `Generated app license data has a duplicate ${key}. Run pnpm --filter @kosmo/app licenses:generate.`,
      );
    }
    committedByKey.set(key, entry);
  }
  for (const entry of current.notices) {
    const key = entryKey(entry);
    if (!sameNotice(entry, committedByKey.get(key) ?? {})) {
      throw new Error(
        `Generated app license data is stale for ${key}. Run pnpm --filter @kosmo/app licenses:generate.`,
      );
    }
  }
}

export function writeLicenseArtifact(data, outputPath) {
  const output = `${JSON.stringify(data, null, 2)}\n`;
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output);
}

function readPnpmLicenseReport(root) {
  const result = spawnSync(
    'pnpm',
    ['--filter', '@kosmo/app', 'licenses', 'list', '--prod', '--json'],
    { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join('\n');
    throw new Error(output || 'pnpm licenses list failed.');
  }
  return JSON.parse(result.stdout);
}

function synchronizeAllPlatforms(root) {
  const result = spawnSync(
    'pnpm',
    [
      'install',
      '--frozen-lockfile',
      '--force',
      '--config.forceIgnoresPlatform=true',
      '--ignore-scripts',
    ],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, CI: 'true' },
      maxBuffer: 50 * 1024 * 1024,
      stdio: 'inherit',
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Could not synchronize all optional platform packages for app license generation (exit ${result.status}).`,
    );
  }
}

export function run(args = process.argv.slice(2)) {
  if (args.some((arg) => arg !== '--check') || args.length > 1) {
    throw new Error('Usage: node scripts/generate-app-licenses.mjs [--check]');
  }
  const check = args.includes('--check');
  if (!check) {
    synchronizeAllPlatforms(workspaceRoot);
  }
  const data = buildLicenseData(readPnpmLicenseReport(workspaceRoot), {
    strictOptionalDependencies: !check,
  });
  if (check) {
    checkLicenseArtifact(data, artifactPath);
  } else {
    writeLicenseArtifact(data, artifactPath);
  }
  console.log(
    check
      ? `Checked ${data.notices.length} installed app license entries.`
      : `Generated ${data.notices.length} app license entries.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
