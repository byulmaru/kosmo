import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { buildTemporalWorkflowBundle } from './build-temporal-workflow-bundle.mjs';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = join(workspaceRoot, 'server-dist');
const stagingRoot = join(workspaceRoot, '.server-dist-staging');

export const SERVER_ARTIFACT_TARGET = 'node26';
export const SERVER_ARTIFACT_OUTPUT_ROOT = outputRoot;

export const SERVER_ARTIFACTS = [
  {
    name: 'web',
    entryPoint: 'apps/web/src/server/index.ts',
  },
  {
    name: 'api',
    entryPoint: 'apps/api/src/index.ts',
  },
  {
    name: 'fedify-consumer',
    entryPoint: 'apps/fedify-consumer/src/index.ts',
  },
  {
    name: 'migration',
    entryPoint: 'packages/core/db/migrate-entry.ts',
  },
  {
    name: 'worker',
    entryPoint: 'apps/worker/src/index.ts',
  },
];

const artifactFileName = 'index.mjs';
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
]);

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function isPackageSpecifier(specifier) {
  return !nodeBuiltins.has(specifier) && !specifier.startsWith('<');
}

async function findPackageVersion(resolvedPath, expectedName) {
  let directory = dirname(resolvedPath);
  while (directory !== dirname(directory)) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (manifest.name === expectedName && typeof manifest.version === 'string') {
        return manifest.version;
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw error;
      }
    }
    directory = dirname(directory);
  }
  throw new Error(`Could not locate ${expectedName} package metadata from ${resolvedPath}`);
}

function bundleWorkspacePackagesPlugin({ externalTemporal = false } = {}) {
  const optionalCanvasNamespace = 'kosmo-optional-canvas';
  const coreRequire = createRequire(join(workspaceRoot, 'packages/core/package.json'));
  const jsdomRoot = dirname(coreRequire.resolve('jsdom/package.json'));
  const jsdomRequire = createRequire(join(jsdomRoot, 'lib/api.js'));
  const cssTreeRoot = dirname(jsdomRequire.resolve('css-tree/package.json'));
  const cssTreeDataPatchPath = join(cssTreeRoot, 'lib/data-patch.js');
  const cssTreeDataPath = join(cssTreeRoot, 'lib/data.js');
  const cssTreeVersionPath = join(cssTreeRoot, 'lib/version.js');
  const jsdomComputedStylePath = join(jsdomRoot, 'lib/jsdom/living/css/helpers/computed-style.js');
  const jsdomXmlHttpRequestPath = join(jsdomRoot, 'lib/jsdom/living/xhr/XMLHttpRequest-impl.js');
  return {
    name: 'bundle-workspace-packages',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^@kosmo\// }, (arguments_) => {
        return { path: createRequire(arguments_.importer).resolve(arguments_.path) };
      });
      buildContext.onResolve({ filter: /^@temporalio\// }, () => {
        if (externalTemporal) {
          return { external: true };
        }
        return undefined;
      });
      buildContext.onResolve({ filter: /^canvas$/ }, () => ({
        namespace: optionalCanvasNamespace,
        path: 'canvas',
      }));
      buildContext.onLoad({ filter: /^canvas$/, namespace: optionalCanvasNamespace }, () => ({
        contents:
          'throw Object.assign(new Error("Cannot find module \\\'canvas\\\'"), { code: "MODULE_NOT_FOUND" });',
        loader: 'js',
      }));
      buildContext.onLoad({ filter: /computed-style\.js$/ }, async (arguments_) => {
        if (arguments_.path !== jsdomComputedStylePath) {
          return undefined;
        }
        const [source, stylesheet] = await Promise.all([
          readFile(arguments_.path, 'utf8'),
          readFile(join(jsdomRoot, 'lib/jsdom/browser/default-stylesheet.css'), 'utf8'),
        ]);
        return {
          contents: source.replace(
            /const defaultStyleSheet = fs\.readFileSync\([\s\S]*?\n\);/u,
            `const defaultStyleSheet = ${JSON.stringify(stylesheet)};`,
          ),
          loader: 'js',
        };
      });
      buildContext.onLoad({ filter: /XMLHttpRequest-impl\.js$/ }, async (arguments_) => {
        if (arguments_.path !== jsdomXmlHttpRequestPath) {
          return undefined;
        }
        const source = await readFile(arguments_.path, 'utf8');
        return {
          // Kosmo uses JSDOM for server-side DOM parsing and serialization, not synchronous XHR.
          // Avoid retaining jsdom's separate worker-thread file in an otherwise single-file artifact.
          contents: source.replace(
            'const syncWorkerFile = require.resolve("./xhr-sync-worker.js");',
            'const syncWorkerFile = undefined;',
          ),
          loader: 'js',
        };
      });
      buildContext.onLoad({ filter: /(?:data|version)(?:-patch)?\.js$/ }, async (arguments_) => {
        if (
          ![cssTreeDataPatchPath, cssTreeDataPath, cssTreeVersionPath].includes(arguments_.path)
        ) {
          return undefined;
        }
        const source = await readFile(arguments_.path, 'utf8');
        if (arguments_.path === cssTreeDataPatchPath) {
          return {
            contents: source.replace(
              /import \{ createRequire \} from 'module';[\s\S]*?const patch = require\('\.\.\/data\/patch\.json'\);/u,
              "import patch from '../data/patch.json';",
            ),
            loader: 'js',
          };
        }
        if (arguments_.path === cssTreeDataPath) {
          return {
            contents: source.replace(
              /import \{ createRequire \} from 'module';[\s\S]*?const mdnSyntaxes = require\('mdn-data\/css\/syntaxes\.json'\);/u,
              "import patch from './data-patch.js';\nimport mdnAtrules from 'mdn-data/css/at-rules.json';\nimport mdnProperties from 'mdn-data/css/properties.json';\nimport mdnSyntaxes from 'mdn-data/css/syntaxes.json';",
            ),
            loader: 'js',
          };
        }
        return {
          contents: source.replace(
            /import \{ createRequire \} from 'module';[\s\S]*?export const \{ version \} = require\('\.\.\/package\.json'\);/u,
            "import packageJson from '../package.json';\nexport const { version } = packageJson;",
          ),
          loader: 'js',
        };
      });
    },
  };
}

async function runtimeDependenciesFromMetafile(metafile) {
  const runtimeDependencies = new Map();
  for (const [input, metadata] of Object.entries(metafile.inputs)) {
    const importerRequire = createRequire(join(workspaceRoot, input));
    for (const dependency of metadata.imports.filter(({ external }) => external)) {
      const specifier = dependency.path;
      if (!isPackageSpecifier(specifier)) {
        continue;
      }
      const packageName = packageNameFromSpecifier(specifier);
      const version = await findPackageVersion(importerRequire.resolve(specifier), packageName);
      const existingVersion = runtimeDependencies.get(packageName);
      if (existingVersion !== undefined && existingVersion !== version) {
        throw new Error(
          `Runtime dependency ${packageName} resolved to both ${existingVersion} and ${version}`,
        );
      }
      runtimeDependencies.set(packageName, version);
    }
  }
  return Object.fromEntries(
    [...runtimeDependencies.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function externalNonBuiltinImportsFromMetafile(metafile) {
  return [
    ...new Set(
      Object.values(metafile.inputs)
        .flatMap(({ imports }) => imports)
        .map(({ path, external }) => (external && isPackageSpecifier(path) ? path : undefined))
        .filter(Boolean),
    ),
  ].sort();
}

function assertArtifactSource(entryPoint) {
  if (!entryPoint.endsWith('.ts')) {
    throw new Error(`Server artifact entrypoint must be TypeScript source: ${entryPoint}`);
  }
}

async function buildArtifact({ name, entryPoint }, artifactRoot) {
  assertArtifactSource(entryPoint);

  const outputDirectory = join(artifactRoot, name);
  const absoluteEntryPoint = join(workspaceRoot, entryPoint);
  const outputFile = join(outputDirectory, artifactFileName);

  await mkdir(outputDirectory, { recursive: true });

  let buildResult;
  try {
    buildResult = await build({
      absWorkingDir: workspaceRoot,
      banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
      },
      bundle: true,
      entryPoints: [absoluteEntryPoint],
      format: 'esm',
      metafile: true,
      outfile: outputFile,
      platform: 'node',
      plugins: [bundleWorkspacePackagesPlugin({ externalTemporal: name === 'worker' })],
      sourcemap: 'external',
      sourcesContent: true,
      target: SERVER_ARTIFACT_TARGET,
      write: true,
    });
  } catch (error) {
    await rm(outputDirectory, { force: true, recursive: true });
    throw new Error(
      `Failed to build ${name} server artifact from ${entryPoint}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  if (!buildResult.metafile) {
    throw new Error(`esbuild did not return dependency metadata for ${name}.`);
  }

  const externalImports = externalNonBuiltinImportsFromMetafile(buildResult.metafile);
  const isWorker = name === 'worker';
  if (!isWorker && externalImports.length > 0) {
    throw new Error(
      `${name} server artifact has non-builtin external imports: ${externalImports.join(', ')}`,
    );
  }

  const dependencies = isWorker ? await runtimeDependenciesFromMetafile(buildResult.metafile) : {};
  if (isWorker) {
    const runtimePackage = {
      name: `@kosmo/runtime-${name}`,
      private: true,
      type: 'module',
      dependencies,
    };
    await writeFile(
      join(outputDirectory, 'runtime-package.json'),
      `${JSON.stringify(runtimePackage, null, 2)}\n`,
    );
  }

  const metadata = {
    artifact: name,
    entryPoint,
    format: 'esm',
    nodeTarget: SERVER_ARTIFACT_TARGET,
    externalImports,
    runtimeDependencies: dependencies,
    files: [artifactFileName, `${artifactFileName}.map`, 'meta.json'],
    inputs: buildResult.metafile.inputs,
    outputs: buildResult.metafile.outputs,
  };

  if (isWorker) {
    metadata.files.splice(2, 0, 'runtime-package.json');
  }

  await writeFile(join(outputDirectory, 'meta.json'), `${JSON.stringify(metadata, null, 2)}\n`);

  return {
    name,
    entryPoint,
    directory: relativeOutputDirectory(name),
    files: metadata.files,
    externalImports,
    runtimeDependencies: dependencies,
    bytes: (await readFile(outputFile)).byteLength,
  };
}

function relativeOutputDirectory(name) {
  return join('server-dist', name);
}

export async function buildServerArtifacts({ artifacts = SERVER_ARTIFACTS } = {}) {
  await rm(stagingRoot, { force: true, recursive: true });
  await rm(outputRoot, { force: true, recursive: true });
  await mkdir(stagingRoot, { recursive: true });

  try {
    const builtArtifacts = [];
    for (const artifact of artifacts) {
      builtArtifacts.push(await buildArtifact(artifact, stagingRoot));
    }

    const workerArtifact = builtArtifacts.find(({ name }) => name === 'worker');
    if (workerArtifact) {
      const workflowMetadata = await buildTemporalWorkflowBundle({
        outputDir: join(stagingRoot, 'worker'),
      });
      const normalizedWorkflowMetadata = {
        ...workflowMetadata,
        artifact: join('server-dist', 'worker', 'workflow-bundle.js'),
      };
      const workerMetadataPath = join(stagingRoot, 'worker', 'meta.json');
      const workerMetadata = JSON.parse(await readFile(workerMetadataPath, 'utf8'));

      workerMetadata.files = [...workerMetadata.files, 'workflow-bundle.js'];
      workerMetadata.workflowBundle = normalizedWorkflowMetadata;
      await writeFile(`${workerMetadataPath}`, `${JSON.stringify(workerMetadata, null, 2)}\n`);
      workerArtifact.files = [...workerArtifact.files, 'workflow-bundle.js'];
      workerArtifact.workflowBundle = normalizedWorkflowMetadata;
    }

    const manifest = {
      format: 'esm',
      nodeTarget: SERVER_ARTIFACT_TARGET,
      artifacts: builtArtifacts,
    };

    await writeFile(join(stagingRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(stagingRoot, outputRoot);
    return manifest;
  } catch (error) {
    await rm(stagingRoot, { force: true, recursive: true });
    await rm(outputRoot, { force: true, recursive: true });
    throw error;
  }
}

const entrypointUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;

if (entrypointUrl === import.meta.url) {
  const manifest = await buildServerArtifacts();
  console.log(`Built ${manifest.artifacts.length} server artifacts under ${outputRoot}`);
}
