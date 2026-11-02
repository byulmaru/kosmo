import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const virtualSources = new Set([
  '__debugid__',
  '__prelude__',
  '__sentryReleaseConstants__',
  '\0polyfill:assets-registry',
  '\0polyfill:environment-variables',
  '\0polyfill:external-require',
  '\0shim:react-native-web/dist/exports/AppRegistry/AppContainer.js',
  '\0shim:react-native-web/dist/exports/BackHandler/index.js',
]);

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inside(directory, filePath) {
  const child = relative(directory, filePath);
  return child === '' || (child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child));
}

function hasNodeModules(filePath) {
  return resolve(filePath).split(sep).includes('node_modules');
}

function readJson(filePath, label) {
  let contents;
  try {
    contents = readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read ${label} at ${filePath}: ${error.message}`, { cause: error });
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error(`Could not parse ${label} at ${filePath}: ${error.message}`, { cause: error });
  }
}

function npmPackageRoot(filePath) {
  const absolutePath = resolve(filePath);
  const root = absolutePath.slice(0, absolutePath.indexOf(sep) + 1);
  const parts = absolutePath.slice(root.length).split(sep).filter(Boolean);
  const nodeModulesIndex = parts.lastIndexOf('node_modules');
  if (nodeModulesIndex < 0) {
    return null;
  }

  const packageStart = nodeModulesIndex + 1;
  const packageEnd = parts[packageStart]?.startsWith('@') ? packageStart + 2 : packageStart + 1;
  if (packageEnd > parts.length) {
    return null;
  }
  return resolve(root, ...parts.slice(0, packageEnd));
}

function findInstalledPackagePath(filePath, { root, label }) {
  const candidate = resolve(filePath);
  if (!existsSync(candidate)) {
    throw new Error(`Could not resolve ${label}: ${candidate} does not exist.`);
  }

  let physicalPath;
  try {
    physicalPath = realpathSync(candidate);
  } catch (error) {
    throw new Error(`Could not resolve ${label}: ${candidate}: ${error.message}`, { cause: error });
  }

  const rootPath = realpathSync(root);
  const localPath = inside(rootPath, physicalPath) && !hasNodeModules(physicalPath);
  const installedRoot = hasNodeModules(physicalPath) ? npmPackageRoot(physicalPath) : null;
  if (hasNodeModules(physicalPath) && !installedRoot) {
    throw new Error(`Could not identify the npm package path for ${label} at ${filePath}.`);
  }
  let cursor = statSync(physicalPath).isDirectory() ? physicalPath : dirname(physicalPath);

  while (true) {
    const packageJsonPath = join(cursor, 'package.json');
    if (existsSync(packageJsonPath)) {
      const manifest = readJson(packageJsonPath, 'package manifest');
      if (
        typeof manifest.name === 'string' &&
        manifest.name &&
        typeof manifest.version === 'string' &&
        manifest.version
      ) {
        const packageRoot = realpathSync(cursor);
        const inWorkspace = inside(rootPath, packageRoot) && !hasNodeModules(packageRoot);
        if (inWorkspace) {
          return { local: true, name: manifest.name, version: manifest.version, packageRoot };
        }
        if (hasNodeModules(packageRoot)) {
          return { local: false, name: manifest.name, version: manifest.version, packageRoot };
        }
        throw new Error(
          `Could not classify ${label} at ${filePath}: ${packageJsonPath} is outside the workspace and node_modules.`,
        );
      }
    }

    if (installedRoot && cursor === installedRoot) {
      break;
    }
    if (cursor === dirname(cursor)) {
      break;
    }
    cursor = dirname(cursor);
  }

  if (localPath) {
    return { local: true, name: null, version: null, packageRoot: physicalPath };
  }
  throw new Error(`Could not find an npm package manifest for ${label} at ${filePath}.`);
}

function addPackagePath(keys, filePath, options) {
  const packageInfo = findInstalledPackagePath(filePath, options);
  if (!packageInfo.local) {
    keys.add(`${packageInfo.name}@${packageInfo.version}`);
  }
  return packageInfo;
}

function resolveSourcePath(source, mapPath, root) {
  const withoutQuery = source.split(/[?#]/, 1)[0];
  if (!withoutQuery) {
    throw new Error(`Source map ${mapPath} contains an empty source path.`);
  }
  if (withoutQuery.startsWith('file://')) {
    const path = fileURLToPath(withoutQuery);
    if (existsSync(path)) {
      return realpathSync(path);
    }
    throw new Error(`Source map ${mapPath} references missing source ${source}.`);
  }

  const candidates = isAbsolute(withoutQuery)
    ? [withoutQuery, resolve(root, withoutQuery.slice(1))]
    : [resolve(dirname(mapPath), withoutQuery), resolve(root, withoutQuery)];
  const sourcePath = candidates.find(existsSync);
  if (!sourcePath) {
    throw new Error(`Source map ${mapPath} references missing source ${source}.`);
  }
  return realpathSync(sourcePath);
}

function allFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...allFiles(filePath));
    } else if (entry.isFile()) {
      files.push(filePath);
    }
  }
  return files.sort(compare);
}

function collectSourceMaps(exportDir, keys, root) {
  const mapPaths = allFiles(exportDir).filter((filePath) => filePath.endsWith('.map'));
  if (!mapPaths.length) {
    throw new Error(`Expo export at ${exportDir} did not emit source maps.`);
  }

  for (const mapPath of mapPaths) {
    const sourceMap = readJson(mapPath, 'Expo source map');
    if (!isObject(sourceMap)) {
      throw new Error(`Expo source map must be a JSON object: ${mapPath}.`);
    }
    if (sourceMap.sections !== undefined) {
      throw new Error(`Indexed source maps are not supported: ${mapPath}.`);
    }
    if (
      sourceMap.sourceRoot !== undefined &&
      (typeof sourceMap.sourceRoot !== 'string' || sourceMap.sourceRoot)
    ) {
      throw new Error(`Source maps with sourceRoot are not supported: ${mapPath}.`);
    }
    if (!Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0) {
      throw new Error(`Expo source map has no sources: ${mapPath}.`);
    }

    for (const source of sourceMap.sources) {
      if (typeof source !== 'string' || !source) {
        throw new Error(`Expo source map contains an invalid source: ${mapPath}.`);
      }
      if (virtualSources.has(source)) {
        continue;
      }
      if (source.startsWith('\0')) {
        throw new Error(
          `Unrecognized Metro virtual source ${JSON.stringify(source)} in ${mapPath}.`,
        );
      }
      addPackagePath(keys, resolveSourcePath(source, mapPath, root), {
        root,
        label: `source ${JSON.stringify(source)} in ${mapPath}`,
      });
    }
  }
}

function resolveExistingPath(filePath, root, label) {
  const candidate = isAbsolute(filePath) ? filePath : resolve(root, filePath);
  if (!existsSync(candidate)) {
    throw new Error(`Could not resolve ${label}: ${candidate} does not exist.`);
  }
  return realpathSync(candidate);
}

function collectAssetMap(exportDir, keys, root, platform) {
  const assetMapPath = join(exportDir, 'assetmap.json');
  if (!existsSync(assetMapPath)) {
    throw new Error(`Expo ${platform} export did not emit ${assetMapPath}.`);
  }
  const assetMap = readJson(assetMapPath, `${platform} Expo asset map`);
  if (!isObject(assetMap)) {
    throw new Error(`Expo ${platform} asset map must be a JSON object: ${assetMapPath}.`);
  }
  if (platform !== 'web' && Object.keys(assetMap).length === 0) {
    throw new Error(`Expo ${platform} asset map did not contain native assets.`);
  }

  for (const [assetId, asset] of Object.entries(assetMap)) {
    if (
      !isObject(asset) ||
      typeof asset.fileSystemLocation !== 'string' ||
      !asset.fileSystemLocation ||
      !Array.isArray(asset.files)
    ) {
      throw new Error(`Expo ${platform} asset ${assetId} has an invalid asset-map record.`);
    }
    if (!asset.files.length) {
      throw new Error(`Expo ${platform} asset ${assetId} has no source files.`);
    }
    const location = resolveExistingPath(
      asset.fileSystemLocation,
      root,
      `asset ${assetId} location`,
    );
    addPackagePath(keys, location, { root, label: `asset ${assetId} location` });
    for (const file of asset.files) {
      if (typeof file !== 'string' || !file) {
        throw new Error(`Expo ${platform} asset ${assetId} contains an invalid source file.`);
      }
      const sourcePath = resolveExistingPath(file, root, `asset ${assetId} file`);
      addPackagePath(keys, sourcePath, { root, label: `asset ${assetId} file` });
    }
  }
}

function collectWebEmittedAssets(exportDir, keys, root) {
  const assetsDir = join(exportDir, 'assets');
  if (!existsSync(assetsDir) || !statSync(assetsDir).isDirectory()) {
    throw new Error(`Expo web export did not emit an assets directory: ${assetsDir}.`);
  }

  for (const emittedPath of allFiles(assetsDir)) {
    const emittedRelativePath = relative(assetsDir, emittedPath);
    const parts = emittedRelativePath.split(sep);
    const emittedName = parts.pop();
    const match = /^(.+)\.([0-9a-f]{32})(?=\.|@)(.+)$/.exec(emittedName);
    if (!match) {
      throw new Error(`Could not decode the Expo MD5 asset name ${emittedRelativePath}.`);
    }
    const [, namePrefix, , nameSuffix] = match;
    const sourceName = `${namePrefix}${nameSuffix}`;
    const appRoot = join(root, 'apps/app');
    let sourcePath;
    if (parts[0] === '__node_modules' || parts[0] === 'node_modules') {
      if (parts[0] === '__node_modules') {
        parts[0] = 'node_modules';
      }
      sourcePath = resolve(root, ...parts, sourceName);
    } else {
      sourcePath = resolve(appRoot, ...parts, sourceName);
    }
    if (!inside(root, sourcePath)) {
      throw new Error(`Web asset escaped the workspace while resolving ${emittedRelativePath}.`);
    }
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      throw new Error(
        `Could not resolve original source for emitted web asset ${emittedRelativePath}: ${sourcePath}.`,
      );
    }
    addPackagePath(keys, realpathSync(sourcePath), {
      root,
      label: `emitted web asset ${emittedRelativePath}`,
    });
  }
}

export function collectExportPackageKeys(exportDir, { root = workspaceRoot, platform } = {}) {
  if (!['web', 'android', 'ios'].includes(platform)) {
    throw new Error(`Unsupported Expo export platform: ${platform}.`);
  }
  const exportPath = resolve(exportDir);
  if (!existsSync(exportPath) || !statSync(exportPath).isDirectory()) {
    throw new Error(`Expo ${platform} export directory does not exist: ${exportPath}.`);
  }

  const workspace = realpathSync(root);
  const keys = new Set();
  collectSourceMaps(exportPath, keys, workspace);
  collectAssetMap(exportPath, keys, workspace, platform);
  if (platform === 'web') {
    collectWebEmittedAssets(exportPath, keys, workspace);
  }
  return [...keys].sort(compare);
}

function requiredNativeRoots(module, platform) {
  const roots = platform === 'android' ? module.projects : module.pods;
  if (!Array.isArray(roots) || roots.length === 0) {
    throw new Error(`Expo module ${module.packageName} has no ${platform} native roots.`);
  }
  return roots.map((root) => (platform === 'android' ? root?.sourceDir : root?.podspecDir));
}

export function collectNativePackageKeys({
  root = workspaceRoot,
  platform,
  expoResolution,
  reactNativeConfig,
}) {
  if (!['android', 'ios'].includes(platform)) {
    throw new Error(`Unsupported native platform: ${platform}.`);
  }
  const workspace = realpathSync(root);
  const keys = new Set();
  const modules = expoResolution?.modules;
  if (!Array.isArray(modules) || modules.length === 0) {
    throw new Error(`Expo ${platform} autolinking did not return modules.`);
  }

  for (const module of modules) {
    if (
      !isObject(module) ||
      typeof module.packageName !== 'string' ||
      !module.packageName ||
      typeof module.packageVersion !== 'string' ||
      !module.packageVersion
    ) {
      throw new Error(`Expo ${platform} autolinking returned an invalid module.`);
    }
    for (const nativeRoot of requiredNativeRoots(module, platform)) {
      if (typeof nativeRoot !== 'string' || !nativeRoot) {
        throw new Error(
          `Expo module ${module.packageName} has an invalid ${platform} native root.`,
        );
      }
      const sourcePath = resolveExistingPath(
        nativeRoot,
        workspace,
        `Expo module ${module.packageName} root`,
      );
      const packageInfo = findInstalledPackagePath(sourcePath, {
        root: workspace,
        label: `Expo module ${module.packageName} ${platform} root`,
      });
      if (
        packageInfo.name !== module.packageName ||
        packageInfo.version !== module.packageVersion
      ) {
        throw new Error(
          `Expo ${platform} module metadata did not match its root: ${module.packageName}@${module.packageVersion} vs ${packageInfo.name}@${packageInfo.version}.`,
        );
      }
      if (!packageInfo.local) {
        keys.add(`${packageInfo.name}@${packageInfo.version}`);
      }
    }
  }

  const dependencies = reactNativeConfig?.dependencies;
  if (!isObject(dependencies)) {
    throw new Error(`React Native ${platform} autolinking did not return dependencies.`);
  }
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (!isObject(dependency)) {
      throw new Error(`React Native ${platform} dependency ${name} has an invalid config.`);
    }
    if (dependency.platforms !== undefined && !isObject(dependency.platforms)) {
      throw new Error(`React Native ${platform} dependency ${name} has invalid platform configs.`);
    }
    const platformConfig = dependency.platforms?.[platform];
    if (platformConfig == null) {
      continue;
    }
    if (!isObject(platformConfig)) {
      throw new Error(
        `React Native ${platform} dependency ${name} has an invalid platform config.`,
      );
    }
    if (typeof dependency.root !== 'string' || !dependency.root) {
      throw new Error(`React Native ${platform} dependency ${name} has no package root.`);
    }
    const sourcePath = resolveExistingPath(
      dependency.root,
      workspace,
      `React Native ${platform} dependency ${name}`,
    );
    const packageInfo = findInstalledPackagePath(sourcePath, {
      root: workspace,
      label: `React Native ${platform} dependency ${name}`,
    });
    if (packageInfo.name !== name) {
      throw new Error(
        `React Native ${platform} dependency ${name} resolved to ${packageInfo.name}.`,
      );
    }
    if (!packageInfo.local) {
      keys.add(`${packageInfo.name}@${packageInfo.version}`);
    }
  }
  return [...keys].sort(compare);
}

function fontDefinitions(config) {
  if (!Array.isArray(config?.plugins)) {
    throw new Error('Evaluated Expo public config is missing its plugin array.');
  }
  const definitions = [];
  for (const plugin of config.plugins) {
    if (typeof plugin !== 'string' && !Array.isArray(plugin)) {
      throw new Error('Evaluated Expo public config contains an invalid plugin entry.');
    }
    const name = typeof plugin === 'string' ? plugin : plugin[0];
    if (typeof name !== 'string' || !name) {
      throw new Error('Evaluated Expo public config contains an invalid plugin name.');
    }
    if (name !== 'expo-font') {
      continue;
    }
    const options = Array.isArray(plugin) ? (plugin[1] ?? {}) : {};
    if (!isObject(options)) {
      throw new Error('Evaluated expo-font config must be an object.');
    }
    if (options.fonts !== undefined) {
      if (
        !Array.isArray(options.fonts) ||
        !options.fonts.every((font) => typeof font === 'string' && font)
      ) {
        throw new Error('Evaluated expo-font fonts must be an array of paths.');
      }
      definitions.push(...options.fonts);
    }
    for (const platform of ['android', 'ios']) {
      const platformOptions = options[platform];
      if (platformOptions !== undefined && !isObject(platformOptions)) {
        throw new Error(`Evaluated expo-font ${platform} config must be an object.`);
      }
      const fonts = platformOptions?.fonts;
      if (fonts === undefined) {
        continue;
      }
      if (!Array.isArray(fonts)) {
        throw new Error(`Evaluated expo-font ${platform}.fonts must be an array.`);
      }
      for (const font of fonts) {
        if (platform === 'ios' || typeof font === 'string') {
          if (typeof font !== 'string' || !font) {
            throw new Error(`Evaluated expo-font ${platform}.fonts entries must be paths.`);
          }
          definitions.push(font);
          continue;
        }
        if (
          !isObject(font) ||
          typeof font.fontFamily !== 'string' ||
          !Array.isArray(font.fontDefinitions)
        ) {
          throw new Error('Evaluated expo-font Android fonts must be paths or font definitions.');
        }
        for (const definition of font.fontDefinitions) {
          if (
            !isObject(definition) ||
            typeof definition.path !== 'string' ||
            !definition.path ||
            typeof definition.weight !== 'number'
          ) {
            throw new Error(`Evaluated expo-font ${platform} font definition must include a path.`);
          }
          definitions.push(definition.path);
        }
      }
    }
  }
  return definitions;
}

export function collectFontPackageKeys({ root = workspaceRoot, publicConfig }) {
  const workspace = realpathSync(root);
  const appRoot = join(workspace, 'apps/app');
  const requireFromApp = createRequire(join(appRoot, 'package.json'));
  const keys = new Set();
  for (const fontPath of fontDefinitions(publicConfig)) {
    const candidates = isAbsolute(fontPath)
      ? [fontPath]
      : [
          resolve(appRoot, fontPath),
          (() => {
            try {
              return requireFromApp.resolve(fontPath);
            } catch {
              return null;
            }
          })(),
        ].filter(Boolean);
    const resolvedFont = candidates.find(existsSync);
    if (!resolvedFont) {
      throw new Error(`Could not resolve evaluated expo-font resource ${fontPath}.`);
    }
    addPackagePath(keys, resolvedFont, {
      root: workspace,
      label: `evaluated expo-font resource ${fontPath}`,
    });
  }
  return [...keys].sort(compare);
}

function runNode(scriptPath, args, { cwd, label, maxOldSpaceSize }) {
  const nodeOptions = maxOldSpaceSize ? [`--max-old-space-size=${maxOldSpaceSize}`] : [];
  const result = spawnSync(process.execPath, [...nodeOptions, scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    const failure = result.error
      ? `error: ${result.error.message}`
      : `exit: ${result.status ?? result.signal}`;
    throw new Error(
      `${label} failed.\n${failure}\nstdout:\n${result.stdout ?? ''}\nstderr:\n${result.stderr ?? ''}`,
      result.error ? { cause: result.error } : undefined,
    );
  }
  return result.stdout;
}

export function collectDistributionPackageKeys(root = workspaceRoot) {
  const workspace = resolve(root);
  const appRoot = join(workspace, 'apps/app');
  const expoCli = join(appRoot, 'node_modules/expo/bin/cli');
  const autolinkingCli = join(appRoot, 'node_modules/expo/bin/autolinking');
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'kosmo-app-distribution-'));
  const keys = new Set();

  try {
    for (const platform of ['web', 'android', 'ios']) {
      const exportDir = join(temporaryRoot, platform);
      runNode(
        expoCli,
        [
          'export',
          '--platform',
          platform,
          '--output-dir',
          exportDir,
          '--source-maps=external',
          '--dump-assetmap',
          '--no-bytecode',
          '--clear',
        ],
        {
          cwd: appRoot,
          label: `Expo ${platform} production export`,
          maxOldSpaceSize: 6144,
        },
      );
      for (const key of collectExportPackageKeys(exportDir, { root: workspace, platform })) {
        keys.add(key);
      }

      if (platform !== 'web') {
        const nativePlatform = platform === 'ios' ? 'apple' : platform;
        const expoResolution = JSON.parse(
          runNode(
            autolinkingCli,
            ['resolve', '--project-root', appRoot, '--platform', nativePlatform, '--json'],
            { cwd: appRoot, label: `Expo ${nativePlatform} autolinking` },
          ),
        );
        const reactNativeConfig = JSON.parse(
          runNode(
            autolinkingCli,
            ['react-native-config', '--project-root', appRoot, '--platform', platform, '--json'],
            { cwd: appRoot, label: `React Native ${platform} autolinking` },
          ),
        );
        for (const key of collectNativePackageKeys({
          root: workspace,
          platform,
          expoResolution,
          reactNativeConfig,
        })) {
          keys.add(key);
        }
      }
    }

    const publicConfig = JSON.parse(
      runNode(expoCli, ['config', '--type', 'public', '--json'], {
        cwd: appRoot,
        label: 'Expo public config evaluation',
      }),
    );
    for (const key of collectFontPackageKeys({ root: workspace, publicConfig })) {
      keys.add(key);
    }
    return [...keys].sort(compare);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
