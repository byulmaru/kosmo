import { copyFile, lstat, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [exportPath, uploadPath] = process.argv.slice(2);

if (!exportPath || !uploadPath) {
  throw new Error('Usage: prepare-expo-ota-sourcemaps.mjs <export-dir> <upload-dir>');
}

const exportDirectory = path.resolve(exportPath);
const uploadDirectory = path.resolve(uploadPath);
const isWithin = (parent, child) => {
  const relativePath = path.relative(parent, child);
  return (
    relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..')
  );
};

if (isWithin(exportDirectory, uploadDirectory) || isWithin(uploadDirectory, exportDirectory)) {
  throw new Error('The export directory and source map upload directory must be separate.');
}

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    const metadata = await lstat(entryPath);

    if (metadata.isSymbolicLink()) {
      throw new Error(`Expo export must not contain symbolic links: ${entryPath}`);
    }

    if (metadata.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (metadata.isFile()) {
      files.push(entryPath);
    } else {
      throw new Error(`Expo export contains an unsupported filesystem entry: ${entryPath}`);
    }
  }

  return files;
};

const exportFiles = await walkFiles(exportDirectory);
const bundlePaths = exportFiles.filter((filePath) => /\.(?:js|hbc)$/.test(filePath)).sort();
const mapPaths = exportFiles.filter((filePath) => filePath.endsWith('.map')).sort();

if (bundlePaths.length === 0) {
  throw new Error(`No JavaScript or Hermes bundles were exported under ${exportDirectory}`);
}

const expectedMapPaths = new Set(bundlePaths.map((bundlePath) => `${bundlePath}.map`));

for (const bundlePath of bundlePaths) {
  const mapPath = `${bundlePath}.map`;

  if (!exportFiles.includes(mapPath)) {
    throw new Error(`Exported bundle is missing its source map: ${bundlePath}`);
  }

  const sourceMap = JSON.parse(await readFile(mapPath, 'utf8'));
  if (
    !Array.isArray(sourceMap.sources) ||
    sourceMap.sources.length === 0 ||
    !Array.isArray(sourceMap.sourcesContent) ||
    sourceMap.sourcesContent.length === 0 ||
    !sourceMap.sourcesContent.some((source) => typeof source === 'string' && source.length > 0)
  ) {
    throw new Error(`Source map must include source paths and embedded source content: ${mapPath}`);
  }
}

for (const mapPath of mapPaths) {
  if (!expectedMapPaths.has(mapPath)) {
    throw new Error(`Source map has no matching exported bundle: ${mapPath}`);
  }
}

await mkdir(uploadDirectory);

const sourceMappingUrl = /^[\t ]*\/\/[#@][\t ]*sourceMappingURL\s*=.*$/gm;

for (const bundlePath of bundlePaths) {
  const relativePath = path.relative(exportDirectory, bundlePath);
  const uploadBundlePath = path.join(uploadDirectory, relativePath);
  const uploadMapPath = `${uploadBundlePath}.map`;
  const mapPath = `${bundlePath}.map`;

  await mkdir(path.dirname(uploadBundlePath), { recursive: true });
  await copyFile(mapPath, uploadMapPath);

  if (bundlePath.endsWith('.js')) {
    const bundle = await readFile(bundlePath, 'utf8');
    const cleanBundle = bundle.replace(sourceMappingUrl, '');
    await writeFile(bundlePath, cleanBundle);
    await writeFile(uploadBundlePath, cleanBundle);
  } else {
    await copyFile(bundlePath, uploadBundlePath);
  }
}

await Promise.all(mapPaths.map((mapPath) => rm(mapPath)));
