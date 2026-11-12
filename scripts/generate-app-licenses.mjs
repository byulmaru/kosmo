import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactPath = join(workspaceRoot, 'apps/app/src/data/open-source-licenses.json');
const noticeRelativePath = 'apps/app/public/reaction-emoji/NOTICE.md';
const hopeReLicenseRelativePath = 'apps/app/licenses/hope-re.LICENSE';
const pendingRelativePath = 'apps/app/licenses/pending-notices.json';
const noticePath = join(workspaceRoot, noticeRelativePath);
const staticLicenseNotices = [
  {
    name: '반응 이모지',
    version: '',
    license: 'MIT · Unicode',
    sourceUrl:
      'https://github.com/byulmaru/kosmo/blob/main/apps/app/public/reaction-emoji/NOTICE.md',
    sourcePath: noticeRelativePath,
  },
  {
    name: 'Hope:RE',
    version: '',
    license: 'MIT',
    sourceUrl:
      'https://github.com/byulmaru/hope-re/blob/509e641253d84110eaa9dc9c35f4d40810ee7608/LICENSE',
    sourcePath: hopeReLicenseRelativePath,
  },
];
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

export function collectLicensePackages(report, { root = workspaceRoot } = {}) {
  const records = new Map();
  for (const [licenseKey, packages] of Object.entries(report)) {
    for (const packageInfo of packages) {
      if (!Array.isArray(packageInfo.versions)) {
        throw new Error(`pnpm license metadata has invalid versions for ${packageInfo.name}`);
      }
      if (
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
        const key = `${packageInfo.name}@${version}`;
        if (manifest.name !== packageInfo.name || manifest.version !== version) {
          throw new Error(`pnpm license metadata did not match ${key}`);
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
  return [...records.values()];
}

export function buildLicenseEntries(
  report,
  {
    root = workspaceRoot,
    notice = noticePath,
    supplementalFiles = supplementalPaths.map((path) => join(root, path)),
    pendingFile = join(root, pendingRelativePath),
  } = {},
) {
  const supplemental = readSupplementalLicenses(supplementalFiles);
  const pending = readPendingNotices(pendingFile);
  const missingText = [];

  const entries = [];
  for (const { name, version, license, manifest, packagePath } of collectLicensePackages(report, {
    root,
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

  const staticEntries = staticLicenseNotices.map(({ sourcePath, ...entry }) => ({
    ...entry,
    text: readFileSync(sourcePath === noticeRelativePath ? notice : join(root, sourcePath), 'utf8'),
  }));
  const allEntries = [...entries, ...staticEntries];
  return allEntries.sort(
    (left, right) => compare(left.name, right.name) || compare(left.version, right.version),
  );
}

export function buildLicenseData(report, options = {}) {
  return {
    notices: buildLicenseEntries(report, options),
  };
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

export function run(args = process.argv.slice(2)) {
  if (args.length) {
    throw new Error('Usage: node scripts/generate-app-licenses.mjs');
  }

  const data = buildLicenseData(readPnpmLicenseReport(workspaceRoot));
  writeLicenseArtifact(data, artifactPath);
  console.log(`Generated ${data.notices.length} app license entries.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
