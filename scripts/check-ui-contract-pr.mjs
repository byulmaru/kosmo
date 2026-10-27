import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';

const REPOSITORY_ROOT = process.env.UI_CONTRACT_REPOSITORY_ROOT
  ? path.resolve(process.env.UI_CONTRACT_REPOSITORY_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VISUAL_PROPERTY =
  /^(?:color|background(?:Color|Image)?|border(?:$|[A-Z])|font(?:$|[A-Z])|shadow(?:$|[A-Z])|opacity$|outline(?:$|[A-Z]))/;
const STYLE_PROPS = new Set(['style', 'visualStyle', 'actionStyle']);
const CHECKER_PATH = 'scripts/check-ui-contract-pr.mjs';
const SVG_OWNER_CONFIG_NAME = 'svgOwnerFiles';
const NON_CUSTOM_SVG_OWNER_FILES = new Set([
  'apps/app/src/components/ui/StateView.tsx',
  'apps/app/src/components/ui/RadioGroup.tsx',
  'apps/app/src/components/ui/ColorPickerPanel.tsx',
  'apps/app/src/components/reaction/ReactionPendingSpinner.tsx',
  'apps/app/src/components/post/PostComposer.tsx',
]);
const CUSTOM_ICON_BODY_LABELS = ['고려한 Lucide 대안', '미채택 이유'];
const POLICY_PATHS = new Set([
  CHECKER_PATH,
  'scripts/check-ui-contract-pr.test.mjs',
  'scripts/eslint-ui-contract.mjs',
  'scripts/eslint-ui-contract.test.mjs',
  'scripts/ui-contract-legacy.json',
  'eslint.config.mjs',
  '.github/workflows/lint.yml',
  'package.json',
]);

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(' ')} failed: ${detail}`);
  }
}

function hasRef(cwd, ref) {
  try {
    git(cwd, ['rev-parse', '--verify', `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function readAtRef(cwd, ref, file) {
  try {
    return git(cwd, ['show', `${ref}:${file}`]);
  } catch (error) {
    const detail = error.message;
    if (detail.includes('exists on disk, but not in') || detail.includes('does not exist in')) {
      return undefined;
    }
    throw error;
  }
}

function listAtRef(cwd, ref, prefix) {
  return git(cwd, ['ls-tree', '-r', '-z', '--name-only', ref, '--', prefix])
    .split('\0')
    .filter(Boolean);
}

function parseSource(source, filePath) {
  return ts.parser.parseForESLint(source, {
    comment: true,
    ecmaVersion: 'latest',
    filePath,
    range: true,
    sourceType: 'module',
    tokens: true,
  }).ast;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'ChainExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function walk(node, visitor, parent = undefined) {
  if (!node || typeof node !== 'object') {
    return;
  }
  visitor(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'parent' ||
      key === 'tokens' ||
      key === 'comments' ||
      key === 'loc' ||
      key === 'range'
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child?.type) {
          walk(child, visitor, node);
        }
      }
    } else if (value?.type) {
      walk(value, visitor, node);
    }
  }
}

function propertyName(property) {
  if (property.key?.type === 'Identifier' && !property.computed) {
    return property.key.name;
  }
  if (property.key?.type === 'Literal' && typeof property.key.value === 'string') {
    return property.key.value;
  }
  return undefined;
}

function tokenValue(token) {
  return `${token.type}:${token.value}`;
}

function tokensInRange(ast, start, end) {
  return (ast.tokens ?? [])
    .filter((token) => token.range[0] >= start && token.range[1] <= end)
    .map(tokenValue)
    .join('|');
}

function isStyleSheetCreate(node) {
  const callee = unwrap(node.callee);
  return (
    callee?.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object?.type === 'Identifier' &&
    callee.object.name === 'StyleSheet' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'create'
  );
}

function jsxName(node) {
  if (!node) {
    return undefined;
  }
  if (node.type === 'JSXIdentifier' || node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'JSXMemberExpression') {
    const object = jsxName(node.object);
    const property = jsxName(node.property);
    return object && property ? `${object}.${property}` : undefined;
  }
  return undefined;
}

function collectStyleRanges(ast) {
  const initializers = new Map();
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      initializers.set(node.id.name, node.init);
    }
  });

  const resolveStyleExpression = (expression, seen = new Set()) => {
    const value = unwrap(expression);
    if (!value) {
      return undefined;
    }
    if (value.type === 'Identifier') {
      if (seen.has(value.name)) {
        return undefined;
      }
      seen.add(value.name);
      return resolveStyleExpression(initializers.get(value.name), seen);
    }
    if (value.type === 'MemberExpression' && value.object?.type === 'Identifier') {
      if (seen.has(value.object.name)) {
        return undefined;
      }
      seen.add(value.object.name);
      return resolveStyleExpression(initializers.get(value.object.name), seen);
    }
    return value;
  };

  const roots = [];
  walk(ast, (node, parent) => {
    if (node.type === 'JSXAttribute' && STYLE_PROPS.has(node.name?.name)) {
      const expression =
        node.value?.type === 'JSXExpressionContainer' ? node.value.expression : null;
      const root = resolveStyleExpression(expression);
      if (root?.range) {
        roots.push({
          component: jsxName(parent?.name),
          property: node.name.name,
          range: root.range,
        });
      }
    }
    if (node.type === 'CallExpression' && isStyleSheetCreate(node)) {
      for (const argument of node.arguments) {
        if (argument?.range) {
          roots.push({ property: 'style', range: argument.range });
        }
      }
    }
  });
  return roots;
}

function collectVisualProperties(ast) {
  const properties = [];
  const styleRanges = collectStyleRanges(ast);
  walk(ast, (node, parent) => {
    if (node.type !== 'Property' || !node.value?.range) {
      return;
    }
    const matchingRanges = styleRanges.filter(
      ({ range: [start, end] }) => node.range[0] >= start && node.range[1] <= end,
    );
    const styleRange = matchingRanges.find(({ component }) => component) ?? matchingRanges[0];
    if (!styleRange) {
      return;
    }
    const name = propertyName(node);
    if (!name || !VISUAL_PROPERTY.test(name)) {
      return;
    }
    let start = node.range[0];
    let end = node.range[1];
    if (parent?.type === 'ObjectExpression') {
      const index = parent.properties.indexOf(node);
      const next = parent.properties[index + 1];
      const previous = parent.properties[index - 1];
      if (next?.range) {
        end = next.range[0];
      } else if (previous?.range) {
        start = previous.range[1];
      }
    }
    properties.push({
      component: styleRange.component,
      fingerprint: `${name}::${tokensInRange(ast, node.value.range[0], node.value.range[1])}`,
      property: styleRange.property,
      range: [start, end],
    });
  });
  return properties;
}

function mergeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range[0] <= previous[1]) {
      previous[1] = Math.max(previous[1], range[1]);
    } else {
      merged.push([...range]);
    }
  }
  return merged;
}

function nonVisualProjection(ast, ranges) {
  const merged = mergeRanges(ranges);
  return (ast.tokens ?? [])
    .filter(
      (token) => !merged.some(([start, end]) => token.range[0] >= start && token.range[1] <= end),
    )
    .map(tokenValue)
    .join('|');
}

function rangeContains(container, range) {
  return range[0] >= container[0] && range[1] <= container[1];
}

function visualOnlyRemoval(baseVisual, headVisual) {
  const remaining = new Map();
  for (const { fingerprint } of headVisual) {
    remaining.set(fingerprint, (remaining.get(fingerprint) ?? 0) + 1);
  }
  let removed = false;
  for (const { fingerprint } of baseVisual) {
    const count = remaining.get(fingerprint) ?? 0;
    if (count > 0) {
      remaining.set(fingerprint, count - 1);
    } else {
      removed = true;
    }
  }
  return removed && [...remaining.values()].every((count) => count === 0);
}

function importSpecifierRange(ast, specifier) {
  const [start, end] = specifier.range;
  const tokens = ast.tokens ?? [];
  const next = tokens.find((token) => token.range[0] >= end);
  if (next?.value === ',') {
    return [start, next.range[1]];
  }
  const previous = [...tokens].reverse().find((token) => token.range[1] <= start);
  if (previous?.value === ',') {
    return [previous.range[0], end];
  }
  return [start, end];
}

function importCleanupRanges(baseAst, headAst, removedVisualRanges) {
  if (removedVisualRanges.length === 0) {
    return [];
  }
  const headBindings = new Set();
  walk(headAst, (node) => {
    if (node.type !== 'ImportDeclaration') {
      return;
    }
    for (const specifier of node.specifiers) {
      if (specifier.local?.name) {
        headBindings.add(`${node.source.value}::${specifier.local.name}`);
      }
    }
  });

  const references = new Map();
  const importRanges = [];
  walk(baseAst, (node) => {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) {
        if (specifier.range) {
          importRanges.push(specifier.range);
        }
      }
    }
    if (
      node.type === 'Identifier' &&
      !importRanges.some((range) => rangeContains(range, node.range))
    ) {
      const ranges = references.get(node.name) ?? [];
      ranges.push(node.range);
      references.set(node.name, ranges);
    }
  });

  const cleanup = [];
  walk(baseAst, (node) => {
    if (node.type !== 'ImportDeclaration') {
      return;
    }
    for (const specifier of node.specifiers) {
      const localName = specifier.local?.name;
      if (!localName || headBindings.has(`${node.source.value}::${localName}`)) {
        continue;
      }
      const uses = references.get(localName) ?? [];
      if (
        uses.every((range) => removedVisualRanges.some((removed) => rangeContains(removed, range)))
      ) {
        cleanup.push(importSpecifierRange(baseAst, specifier));
      }
    }
  });
  return cleanup;
}

function analyzeSource(baseSource, headSource, filePath) {
  let base;
  let head;
  try {
    base = baseSource === undefined ? undefined : parseSource(baseSource, filePath);
    head = headSource === undefined ? undefined : parseSource(headSource, filePath);
  } catch (error) {
    return { error: `AST parsing failed for ${filePath}: ${error.message}` };
  }

  const baseVisual = base ? collectVisualProperties(base) : [];
  const headVisual = head ? collectVisualProperties(head) : [];
  const baseFingerprints = baseVisual.map(({ fingerprint }) => fingerprint).sort();
  const headFingerprints = headVisual.map(({ fingerprint }) => fingerprint).sort();
  const removedVisualRanges = [];
  const removedVisualFingerprints = [];
  const removedVisualEntries = [];
  const remainingHeadFingerprints = new Map();
  for (const { fingerprint } of headVisual) {
    remainingHeadFingerprints.set(
      fingerprint,
      (remainingHeadFingerprints.get(fingerprint) ?? 0) + 1,
    );
  }
  for (const item of baseVisual) {
    const count = remainingHeadFingerprints.get(item.fingerprint) ?? 0;
    if (count > 0) {
      remainingHeadFingerprints.set(item.fingerprint, count - 1);
    } else {
      removedVisualRanges.push(item.range);
      removedVisualFingerprints.push(item.fingerprint);
      removedVisualEntries.push({
        component: item.component,
        fingerprint: item.fingerprint,
        property: item.property,
      });
    }
  }
  const baseProjection = base
    ? nonVisualProjection(base, [
        ...baseVisual.map(({ range }) => range),
        ...(head ? importCleanupRanges(base, head, removedVisualRanges) : []),
      ])
    : '';
  const headProjection = head
    ? nonVisualProjection(
        head,
        headVisual.map(({ range }) => range),
      )
    : '';
  if (!base) {
    const hasVisualSource = headVisual.length > 0;
    return {
      nonVisualChanged: !hasVisualSource && headSource !== undefined,
      visualChanged: hasVisualSource,
      visualOnlyRemoval: false,
      removedVisualFingerprints,
      removedVisualEntries,
    };
  }
  if (!head) {
    const hasVisualSource = baseVisual.length > 0;
    return {
      nonVisualChanged: !hasVisualSource,
      visualChanged: hasVisualSource,
      visualOnlyRemoval: hasVisualSource,
      removedVisualFingerprints,
      removedVisualEntries,
    };
  }
  return {
    nonVisualChanged: baseProjection !== headProjection,
    visualChanged: JSON.stringify(baseFingerprints) !== JSON.stringify(headFingerprints),
    visualOnlyRemoval: visualOnlyRemoval(baseVisual, headVisual),
    removedVisualFingerprints,
    removedVisualEntries,
  };
}

function resolveImportPath(importer, specifier, available) {
  let candidate;
  if (specifier.startsWith('@/')) {
    candidate = path.posix.normalize(`apps/app/src/${specifier.slice(2)}`);
  } else if (specifier.startsWith('.')) {
    candidate = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier));
  } else {
    return undefined;
  }
  const choices = [
    candidate,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.native.ts`,
    `${candidate}.native.tsx`,
    `${candidate}.web.ts`,
    `${candidate}.web.tsx`,
    `${candidate}.js`,
    `${candidate}.jsx`,
    `${candidate}.native.js`,
    `${candidate}.native.jsx`,
    `${candidate}.web.js`,
    `${candidate}.web.jsx`,
    `${candidate}/index.ts`,
    `${candidate}/index.tsx`,
  ];
  return choices.find((choice) => available.has(choice));
}

function storyTargets(source, storyPath, available) {
  const ast = parseSource(source, storyPath);
  const imports = new Map();
  const localWrappers = new Map();
  let productionImport = false;
  for (const statement of ast.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    if (statement.importKind === 'type') {
      continue;
    }
    const resolved = resolveImportPath(storyPath, statement.source.value, available);
    if (!resolved) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.local?.name && specifier.importKind !== 'type') {
        imports.set(specifier.local.name, resolved);
      }
    }
  }

  const collectRenderedNames = (functionNode) => {
    const bindingNames = (pattern) => {
      if (!pattern) {
        return [];
      }
      if (pattern.type === 'Identifier') {
        return [pattern.name];
      }
      if (pattern.type === 'RestElement') {
        return bindingNames(pattern.argument);
      }
      if (pattern.type === 'AssignmentPattern') {
        return bindingNames(pattern.left);
      }
      if (pattern.type === 'ArrayPattern') {
        return pattern.elements.flatMap(bindingNames);
      }
      if (pattern.type === 'ObjectPattern') {
        return pattern.properties.flatMap((property) =>
          property.type === 'Property'
            ? bindingNames(property.value)
            : bindingNames(property.argument),
        );
      }
      return [];
    };
    const names = new Set();
    const shadowed = new Set((functionNode.params ?? []).flatMap(bindingNames));
    const visitStatic = (node, visitor, isRoot = true) => {
      if (!node || typeof node !== 'object') {
        return;
      }
      if (
        !isRoot &&
        (node.type === 'FunctionDeclaration' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression')
      ) {
        return;
      }
      visitor(node);
      for (const [key, value] of Object.entries(node)) {
        if (
          key === 'parent' ||
          key === 'tokens' ||
          key === 'comments' ||
          key === 'loc' ||
          key === 'range'
        ) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child?.type) {
              visitStatic(child, visitor, false);
            }
          }
        } else if (value?.type) {
          visitStatic(value, visitor, false);
        }
      }
    };
    visitStatic(functionNode, (node) => {
      if (node.type === 'VariableDeclarator') {
        for (const name of bindingNames(node.id)) {
          shadowed.add(name);
        }
      }
    });
    const returnedRoots = [];
    if (
      functionNode.type === 'ArrowFunctionExpression' &&
      functionNode.body?.type !== 'BlockStatement'
    ) {
      returnedRoots.push(functionNode.body);
    } else {
      visitStatic(functionNode, (node) => {
        if (node.type === 'ReturnStatement' && node.argument) {
          returnedRoots.push(node.argument);
        }
      });
    }
    for (const root of returnedRoots) {
      visitStatic(root, (node) => {
        if (node.type === 'JSXOpeningElement') {
          const name = jsxName(node.name);
          if (name && !shadowed.has(name)) {
            names.add(name);
          }
        }
      });
    }
    return names;
  };

  for (const statement of ast.body) {
    const functionDeclaration =
      statement.type === 'FunctionDeclaration'
        ? statement
        : statement.type === 'ExportNamedDeclaration' &&
            statement.declaration?.type === 'FunctionDeclaration'
          ? statement.declaration
          : undefined;
    if (functionDeclaration?.id?.name) {
      localWrappers.set(functionDeclaration.id.name, collectRenderedNames(functionDeclaration));
    }
    const declaration =
      statement.type === 'VariableDeclaration'
        ? statement
        : statement.type === 'ExportNamedDeclaration' &&
            statement.declaration?.type === 'VariableDeclaration'
          ? statement.declaration
          : undefined;
    for (const item of declaration?.declarations ?? []) {
      if (
        item.id?.type === 'Identifier' &&
        (item.init?.type === 'ArrowFunctionExpression' || item.init?.type === 'FunctionExpression')
      ) {
        localWrappers.set(item.id.name, collectRenderedNames(item.init));
      }
    }
  }

  const resolveTarget = (name, seen = new Set()) => {
    if (seen.has(name)) {
      return [];
    }
    if (imports.has(name)) {
      return [imports.get(name)];
    }
    const rendered = localWrappers.get(name);
    if (!rendered) {
      return [];
    }
    const nextSeen = new Set(seen).add(name);
    return [...rendered].flatMap((renderedName) => resolveTarget(renderedName, nextSeen));
  };

  const targets = new Set();
  walk(ast, (node) => {
    if (node.type !== 'Property' || propertyName(node) !== 'component') {
      return;
    }
    const value = unwrap(node.value);
    if (value?.type === 'Identifier') {
      for (const target of resolveTarget(value.name)) {
        targets.add(target);
      }
    }
  });
  productionImport = [...targets].some((target) => target.startsWith('apps/app/src/components/'));
  return { productionImport, targets };
}

function buildCatalog(cwd, ref) {
  const available = new Set(listAtRef(cwd, ref, 'apps/app/src'));
  const owners = new Set();
  const storyInfo = new Map();
  for (const story of available) {
    if (!isStoryPath(story)) {
      continue;
    }
    const source = readAtRef(cwd, ref, story);
    if (source === undefined) {
      continue;
    }
    try {
      const info = storyTargets(source, story, available);
      storyInfo.set(story, info);
      for (const target of info.targets) {
        owners.add(target);
      }
    } catch {
      // A malformed unrelated story is reported when it is part of the diff.
    }
  }
  return { available, owners, storyInfo };
}

function isStoryPath(file) {
  return /^apps\/app\/src\/stories\/(?:components|patterns)\/.*\.stories\.[cm]?[jt]sx?$/.test(file);
}

function isScreenStory(file) {
  return /^apps\/app\/src\/stories\/screens\//.test(file);
}

function isTestPath(file) {
  return /^apps\/app\/src\/.*(?:\.test|\.tests)\.[cm]?[jt]sx?$/.test(file);
}

function isAppSource(file) {
  return /^apps\/app\/src\/.*\.[cm]?[jt]sx?$/.test(file) && !isTestPath(file);
}

function isUiOwnerPath(file) {
  return file.startsWith('apps/app/src/components/ui/');
}

function isMixedSource(source, filePath) {
  if (!source) {
    return false;
  }
  try {
    const ast = parseSource(source, filePath);
    return ast.body.some(
      (node) =>
        node.type === 'ImportDeclaration' &&
        (node.source.value === 'react-relay' ||
          node.source.value === 'expo-router' ||
          node.source.value === '@/components/FeatureFlagsContext' ||
          (node.source.value.startsWith('.') &&
            path.posix.normalize(
              path.posix.join(path.posix.dirname(filePath), node.source.value),
            ) === 'apps/app/src/components/FeatureFlagsContext')),
    );
  } catch {
    return true;
  }
}

function changedFiles(cwd, base, head) {
  const parts = git(cwd, [
    'diff',
    '--name-status',
    '-z',
    '--find-renames',
    '--find-copies',
    `${base}...${head}`,
    '--',
  ]).split('\0');
  const changes = [];
  for (let index = 0; index < parts.length - 1; ) {
    const status = parts[index++][0];
    if (!status) {
      continue;
    }
    if (status === 'R' || status === 'C') {
      changes.push({ oldPath: parts[index++], path: parts[index++], status });
    } else {
      changes.push({ path: parts[index++], status });
    }
  }
  return changes;
}

function basePolicyExists(cwd, base) {
  return readAtRef(cwd, base, CHECKER_PATH) !== undefined;
}

function packagePolicyFingerprint(source) {
  if (!source) {
    return 'missing';
  }
  try {
    const packageJson = JSON.parse(source);
    const packageScripts = packageJson.scripts ?? {};
    const scripts = Object.fromEntries(
      ['lint:eslint', 'test', 'test:eslint'].map((name) => [
        name,
        typeof packageScripts[name] === 'string' ? packageScripts[name] : null,
      ]),
    );
    const dependencies = Object.fromEntries(
      Object.entries({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      }).filter(([name]) => name === 'typescript-eslint' || name.startsWith('eslint')),
    );
    return JSON.stringify({ dependencies, scripts });
  } catch {
    return 'invalid';
  }
}

function legacySnapshotChangeKind(baseSource, headSource) {
  if (!baseSource || !headSource) {
    if (baseSource && !headSource) {
      try {
        const base = JSON.parse(baseSource);
        const reductions = new Map();
        for (const [key, entry] of Object.entries(base.entries ?? {})) {
          if (!Number.isInteger(entry?.occurrences)) {
            return { kind: 'policy' };
          }
          reductions.set(key, entry.occurrences);
        }
        return {
          kind: 'narrowing',
          reductions,
        };
      } catch {
        return { kind: 'policy' };
      }
    }
    return { kind: 'policy' };
  }
  try {
    const base = JSON.parse(baseSource);
    const head = JSON.parse(headSource);
    if (
      base.version !== head.version ||
      typeof base.entries !== 'object' ||
      typeof head.entries !== 'object'
    ) {
      return { kind: 'policy' };
    }
    const baseEntries = base.entries ?? {};
    const headEntries = head.entries ?? {};
    let narrowed = false;
    const reductions = new Map();
    if (Object.keys(baseEntries).length !== Object.keys(headEntries).length) {
      narrowed = true;
    }
    for (const [key, entry] of Object.entries(headEntries)) {
      const previous = baseEntries[key];
      if (!previous || typeof previous !== 'object' || typeof entry !== 'object') {
        return { kind: 'policy' };
      }
      const { occurrences: previousOccurrences, ...previousMetadata } = previous;
      const { occurrences, ...metadata } = entry;
      if (JSON.stringify(previousMetadata) !== JSON.stringify(metadata)) {
        return { kind: 'policy' };
      }
      if (!Number.isInteger(previousOccurrences) || !Number.isInteger(occurrences)) {
        return { kind: 'policy' };
      }
      if (occurrences > previousOccurrences) {
        return { kind: 'policy' };
      }
      if (occurrences < previousOccurrences) {
        narrowed = true;
        reductions.set(key, previousOccurrences - occurrences);
      }
    }
    for (const [key, entry] of Object.entries(baseEntries)) {
      if (!(key in headEntries)) {
        if (!Number.isInteger(entry?.occurrences)) {
          return { kind: 'policy' };
        }
        reductions.set(key, entry.occurrences);
      }
    }
    return narrowed ? { kind: 'narrowing', reductions } : { kind: 'policy' };
  } catch {
    return { kind: 'policy' };
  }
}

function isPolicyPath(cwd, base, head, file) {
  if (!POLICY_PATHS.has(file)) {
    return false;
  }
  if (file !== 'package.json') {
    return true;
  }
  return (
    packagePolicyFingerprint(readAtRef(cwd, base, file)) !==
    packagePolicyFingerprint(readAtRef(cwd, head, file))
  );
}

function legacyCleanupForFile(file, analysis, reductions) {
  const removedCounts = new Map();
  for (const removed of analysis.removedVisualEntries ?? []) {
    const key = `${removed.component ?? ''}::${removed.property}::${removed.fingerprint}`;
    removedCounts.set(key, (removedCounts.get(key) ?? 0) + 1);
  }
  const consumed = new Map();
  for (const [key, available] of reductions) {
    const [entryFile, component, styleProp, property, ...valueParts] = key.split('::');
    if (entryFile !== file) {
      continue;
    }
    const fingerprint = `${component ?? ''}::${styleProp}::${property}::${valueParts.join('::')}`;
    const matching = removedCounts.get(fingerprint) ?? 0;
    const count = Math.min(available, matching);
    if (count > 0) {
      consumed.set(key, count);
      removedCounts.set(fingerprint, matching - count);
    }
  }
  return {
    consumed,
    matchesAllRemoved:
      consumed.size > 0 && [...removedCounts.values()].every((count) => count === 0),
  };
}

function platformIndependentPath(file) {
  return file.replace(/\.(?:native|web)(?=\.[cm]?[jt]sx?$)/, '');
}

function catalogOwnsSource(file, owners) {
  const normalized = platformIndependentPath(file);
  return [...owners].some((owner) => platformIndependentPath(owner) === normalized);
}

function parseSvgOwnerConfig(source, filePath = 'eslint.config.mjs') {
  if (source === undefined) {
    return { error: `${filePath}: svgOwnerFiles declaration is missing.` };
  }
  try {
    const ast = parseSource(source, filePath);
    const declarations = [];
    for (const statement of ast.body) {
      if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') {
        continue;
      }
      for (const declaration of statement.declarations) {
        if (
          declaration.id?.type === 'Identifier' &&
          declaration.id.name === SVG_OWNER_CONFIG_NAME
        ) {
          declarations.push(declaration);
        }
      }
    }
    if (declarations.length !== 1 || declarations[0].init?.type !== 'ArrayExpression') {
      return { error: `${filePath}: svgOwnerFiles must be one top-level const literal array.` };
    }
    const values = [];
    for (const element of declarations[0].init.elements) {
      if (element?.type !== 'Literal' || typeof element.value !== 'string') {
        return { error: `${filePath}: svgOwnerFiles entries must be string literals.` };
      }
      values.push(element.value);
    }
    if (new Set(values).size !== values.length) {
      return { error: `${filePath}: svgOwnerFiles entries must be unique.` };
    }
    return { ast, values, range: declarations[0].init.range };
  } catch (error) {
    return { error: `${filePath}: unable to parse svgOwnerFiles: ${error.message}` };
  }
}

function isCustomIconOwnerPath(file) {
  return (
    /^apps\/app\/src\/components\/(?:[^/\\*?]+\/)*[^/\\*?]+\.[cm]?[jt]sx?$/.test(file) &&
    !file.split('/').some((segment) => segment === '..') &&
    !/(?:\.test|\.tests|\.stories|\.type-test)\.[cm]?[jt]sx?$/.test(file)
  );
}

function customIconConfigChange(baseSource, headSource) {
  const base = parseSvgOwnerConfig(baseSource);
  const head = parseSvgOwnerConfig(headSource);
  if (base.error || head.error) {
    return { kind: 'policy', additions: [], errors: [] };
  }
  if (nonVisualProjection(base.ast, [base.range]) !== nonVisualProjection(head.ast, [head.range])) {
    return {
      kind: 'policy',
      additions: [],
      errors: [],
    };
  }
  if (
    head.values.length < base.values.length ||
    base.values.some((entry) => !head.values.includes(entry))
  ) {
    return {
      kind: 'policy',
      additions: [],
      errors: [],
    };
  }
  const additions = head.values.filter((entry) => !base.values.includes(entry));
  if (additions.length === 0) {
    return { kind: 'policy', additions, errors: [] };
  }
  if (additions.some((entry) => !isCustomIconOwnerPath(entry))) {
    return {
      kind: 'invalid',
      additions,
      errors: [
        'eslint.config.mjs: custom icon owner entries must be exact components/* source paths.',
      ],
    };
  }
  return { kind: 'candidate', additions, errors: [] };
}

function registeredCustomIconOwners(source) {
  const config = parseSvgOwnerConfig(source);
  return new Set((config.values ?? []).filter((entry) => !NON_CUSTOM_SVG_OWNER_FILES.has(entry)));
}

function sourceImportsValue(source, filePath, packagePrefix) {
  if (source === undefined) {
    return false;
  }
  try {
    const ast = parseSource(source, filePath);
    return ast.body.some(
      (node) =>
        node.type === 'ImportDeclaration' &&
        node.importKind !== 'type' &&
        typeof node.source.value === 'string' &&
        (node.source.value === packagePrefix ||
          node.source.value.startsWith(`${packagePrefix}/`)) &&
        node.specifiers.some((specifier) => specifier.importKind !== 'type'),
    );
  } catch {
    return false;
  }
}

function bodyFieldIsMeaningful(body, label) {
  const withoutComments = String(body ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const pattern = new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${label}\\s*[:：]\\s*([^\\n]*)`);
  const match = withoutComments.match(pattern);
  if (!match) {
    return false;
  }
  const value = match[1].trim();
  return value.length > 0 && !/^(?:없음|해당\s*없음|n\/?a|todo|tbd|[-_…]+)$/i.test(value);
}

function customIconBodyIsComplete(body) {
  return CUSTOM_ICON_BODY_LABELS.every((label) => bodyFieldIsMeaningful(body, label));
}

function directImportsTarget(source, importer, target, available) {
  if (source === undefined) {
    return false;
  }
  try {
    const ast = parseSource(source, importer);
    return ast.body.some((node) => {
      if (node.type !== 'ImportDeclaration') {
        return false;
      }
      if (
        node.importKind === 'type' ||
        !node.specifiers.some((specifier) => specifier.importKind !== 'type')
      ) {
        return false;
      }
      return resolveImportPath(importer, node.source.value, available) === target;
    });
  } catch {
    return false;
  }
}

function changedStorySupportsIcon({ cwd, head, headCatalog, changedFilesList, target }) {
  // shortcut: inspect direct/one-hop static imports only; extend for re-export graphs when admission needs them.
  return changedFilesList.some((changed) => {
    const story = changed.path;
    if (!isStoryPath(story)) {
      return false;
    }
    const source = readAtRef(cwd, head, story);
    const info = source ? headCatalog.storyInfo.get(story) : undefined;
    if (!info) {
      return false;
    }
    if (info.targets.has(target)) {
      return true;
    }
    return [...info.targets].some((component) =>
      directImportsTarget(
        readAtRef(cwd, head, component),
        component,
        target,
        headCatalog.available,
      ),
    );
  });
}

function evaluateCustomIconAdmission({ cwd, head, baseConfig, headConfig, files, headCatalog }) {
  const change = customIconConfigChange(baseConfig, headConfig);
  if (change.kind !== 'candidate') {
    return { ...change, sourcePaths: new Set() };
  }
  const errors = [];
  const sourcePaths = new Set();
  for (const target of change.additions) {
    const changed = files.find(({ path: file, oldPath }) => file === target || oldPath === target);
    const source = readAtRef(cwd, head, target);
    if (!changed || source === undefined) {
      errors.push(
        `eslint.config.mjs: custom icon owner ${target} must be added or modified in this PR.`,
      );
      continue;
    }
    if (!sourceImportsValue(source, target, 'react-native-svg')) {
      errors.push(`${target}: custom icon owner must contain a react-native-svg value import.`);
      continue;
    }
    if (isMixedSource(source, target)) {
      errors.push(
        `${target}: custom icon owner cannot include Relay, route, or feature-flag integration.`,
      );
      continue;
    }
    if (!changedStorySupportsIcon({ cwd, head, headCatalog, changedFilesList: files, target })) {
      errors.push(
        `${target}: custom icon admission requires a changed representative component/pattern story.`,
      );
      continue;
    }
    sourcePaths.add(target);
  }
  return {
    kind: errors.length ? 'invalid' : 'valid',
    additions: change.additions,
    errors,
    sourcePaths,
  };
}

function classifyPullRequest({ base, head, cwd = REPOSITORY_ROOT, bootstrap = false, prBody }) {
  if (!base || !head) {
    return { errors: ['Both --base and --head are required.'], signals: [] };
  }
  if (!hasRef(cwd, base) || !hasRef(cwd, head)) {
    return {
      errors: [`Unable to resolve required Git refs: base=${base}, head=${head}.`],
      signals: [],
    };
  }

  const baseCatalog = buildCatalog(cwd, base);
  const headCatalog = buildCatalog(cwd, head);
  const owners = new Set([...baseCatalog.owners, ...headCatalog.owners]);
  const files = changedFiles(cwd, base, head);
  const errors = [];
  const signals = [];
  const categories = new Set();
  const baseHasPolicy = basePolicyExists(cwd, base);
  let uiCleanupOnly = true;
  const legacyReductions = new Map();
  const legacyConsumed = new Map();
  const legacyChange = files.some(
    ({ path: changedPath }) => changedPath === 'scripts/ui-contract-legacy.json',
  )
    ? legacySnapshotChangeKind(
        readAtRef(cwd, base, 'scripts/ui-contract-legacy.json'),
        readAtRef(cwd, head, 'scripts/ui-contract-legacy.json'),
      )
    : { kind: 'unchanged' };
  const customAdmission = files.some(({ path: file }) => file === 'eslint.config.mjs')
    ? evaluateCustomIconAdmission({
        baseConfig: readAtRef(cwd, base, 'eslint.config.mjs'),
        files,
        head,
        headCatalog,
        headConfig: readAtRef(cwd, head, 'eslint.config.mjs'),
        cwd,
      })
    : { kind: 'unchanged', additions: [], errors: [], sourcePaths: new Set() };
  const customSourcePaths = new Set([
    ...registeredCustomIconOwners(readAtRef(cwd, base, 'eslint.config.mjs')),
    ...customAdmission.sourcePaths,
  ]);
  const requiresCustomIconBody = files.some(
    ({ path: file, oldPath }) =>
      customSourcePaths.has(file) || (oldPath && customSourcePaths.has(oldPath)),
  );
  if (requiresCustomIconBody && !customIconBodyIsComplete(prBody)) {
    errors.push(
      `Custom icon changes require nonempty PR body fields: ${CUSTOM_ICON_BODY_LABELS.map((label) => `${label}:`).join(' / ')}.`,
    );
  }
  if (customAdmission.kind === 'invalid') {
    errors.push(...customAdmission.errors);
  }
  if (legacyChange.kind === 'narrowing') {
    for (const [key, count] of legacyChange.reductions) {
      legacyReductions.set(key, count);
    }
  }

  for (const changed of files) {
    const file = changed.path;
    if (!file) {
      continue;
    }
    if (file === 'scripts/ui-contract-legacy.json') {
      if (legacyChange.kind === 'narrowing') {
        signals.push(`${file}: treated as supporting legacy-contract cleanup.`);
        continue;
      }
    }
    if (file === 'eslint.config.mjs' && customAdmission.kind === 'valid') {
      categories.add('ui');
      uiCleanupOnly = false;
      signals.push(`${file}: treated as a custom icon owner admission.`);
      continue;
    }
    if (isPolicyPath(cwd, base, head, file)) {
      categories.add('policy');
      if (!baseHasPolicy && !bootstrap) {
        errors.push(
          `${file}: initial enforcement policy introduction requires the explicit bootstrap path.`,
        );
      } else {
        signals.push(`${file}: treated as a dedicated enforcement-policy change.`);
      }
      continue;
    }

    if (isScreenStory(file)) {
      signals.push(`${file}: treated as supporting story evidence.`);
      continue;
    }

    if (isStoryPath(file)) {
      const source = readAtRef(cwd, head, file) ?? readAtRef(cwd, base, file);
      try {
        const info = source ? storyTargets(source, file, headCatalog.available) : undefined;
        if (!info?.productionImport) {
          errors.push(
            `${file}: changed component/pattern story has no production component import.`,
          );
        } else {
          signals.push(`${file}: treated as UI supporting evidence.`);
        }
      } catch (error) {
        errors.push(`${file}: unable to classify story component imports: ${error.message}`);
      }
      continue;
    }

    if (
      isTestPath(file) ||
      file.startsWith('docs/') ||
      file.startsWith('memory/') ||
      file === '.github/pull_request_template.md' ||
      file.startsWith('.github/PULL_REQUEST_TEMPLATE/')
    ) {
      signals.push(`${file}: treated as supporting change.`);
      continue;
    }

    if (!isAppSource(file)) {
      categories.add('feature');
      continue;
    }

    const baseSource = readAtRef(cwd, base, changed.oldPath ?? file);
    const headSource = changed.status === 'D' ? undefined : readAtRef(cwd, head, file);
    const catalogOwner =
      catalogOwnsSource(file, owners) ||
      (changed.oldPath && catalogOwnsSource(changed.oldPath, owners));
    const registeredCustomSource =
      customSourcePaths.has(file) || (changed.oldPath && customSourcePaths.has(changed.oldPath));
    const owner = isUiOwnerPath(file) || catalogOwner || registeredCustomSource;
    const isNewSource = baseSource === undefined && headSource !== undefined;
    const mixedOwner =
      owner && (isMixedSource(baseSource, file) || isMixedSource(headSource, file));
    const analysis = analyzeSource(baseSource, headSource, file);
    if (analysis.error) {
      errors.push(analysis.error);
      continue;
    }
    const legacyCleanup = legacyCleanupForFile(file, analysis, legacyReductions);
    if (legacyCleanup.matchesAllRemoved && analysis.visualOnlyRemoval && !mixedOwner) {
      for (const [key, count] of legacyCleanup.consumed) {
        legacyConsumed.set(key, (legacyConsumed.get(key) ?? 0) + count);
      }
      categories.add('feature');
      continue;
    }

    if (isNewSource && isUiOwnerPath(file) && !catalogOwner && !registeredCustomSource) {
      errors.push(`${file}: new UI source has no component/pattern story catalog entry.`);
      continue;
    }

    if (owner && !mixedOwner && (!isNewSource || catalogOwner || registeredCustomSource)) {
      categories.add('ui');
      if (!analysis.visualOnlyRemoval || analysis.nonVisualChanged) {
        uiCleanupOnly = false;
      }
      continue;
    }

    if (mixedOwner && isNewSource && (analysis.visualChanged || analysis.nonVisualChanged)) {
      errors.push(
        `${file}: a new cataloged source with Relay/route integration cannot combine a visual definition with runtime integration.`,
      );
      continue;
    }
    if (analysis.visualChanged && analysis.nonVisualChanged) {
      errors.push(
        `${file}: the same source changes visual contract and feature logic; split the UI and feature changes.`,
      );
      continue;
    }
    if (analysis.visualChanged) {
      if (
        !catalogOwnsSource(file, owners) &&
        headSource !== undefined &&
        baseSource === undefined
      ) {
        errors.push(`${file}: new visual source has no component/pattern story catalog entry.`);
      } else {
        categories.add('ui');
        if (!analysis.visualOnlyRemoval || analysis.nonVisualChanged || isNewSource || mixedOwner) {
          uiCleanupOnly = false;
        }
      }
    } else if (analysis.nonVisualChanged) {
      categories.add('feature');
    } else if (changed.status === 'D' || changed.status === 'R') {
      categories.add('feature');
    }
  }

  if (categories.has('ui') && categories.has('feature')) {
    errors.push(
      'The PR mixes UI contract changes with feature changes; split the changes into separate PRs.',
    );
  }
  if (categories.has('policy') && (categories.has('ui') || categories.has('feature'))) {
    const allowsInitialCleanup =
      !baseHasPolicy &&
      bootstrap &&
      categories.has('ui') &&
      !categories.has('feature') &&
      uiCleanupOnly;
    if (!allowsInitialCleanup) {
      errors.push(
        'The PR mixes enforcement-policy changes with runtime UI or feature changes; split the policy review.',
      );
    }
  }
  for (const [key, count] of legacyReductions) {
    if ((legacyConsumed.get(key) ?? 0) < count) {
      errors.push(
        `scripts/ui-contract-legacy.json: narrowing entry ${key} has no matching consumer visual cleanup.`,
      );
    }
  }
  return { errors, signals, categories: [...categories], files };
}

const MERGE_QUEUE_QUERY = `
  query UiContractMergeQueue($owner: String!, $name: String!, $branch: String!, $after: String) {
    repository(owner: $owner, name: $name) {
      mergeQueue(branch: $branch) {
        entries(first: 100, after: $after) {
          nodes {
            headCommit { oid }
            baseCommit { oid }
            pullRequest { number headRefOid baseRefOid body }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }
`;

function gitIsAncestor(cwd, ancestor, descendant) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd,
      stdio: 'ignore',
    });
    return true;
  } catch (error) {
    if (error.status === 1) {
      return false;
    }
    throw new Error(
      `Unable to verify merge queue ancestry for ${ancestor} -> ${descendant}: ${error.message}`,
    );
  }
}

export function ensureMergeGroupCommits(cwd, commits, remote = 'origin') {
  const required = [...new Set(commits.filter(Boolean))];
  const missing = required.filter((commit) => !hasRef(cwd, commit));
  if (missing.length > 0) {
    try {
      execFileSync('git', ['fetch', '--no-tags', remote, ...missing], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      throw new Error(
        `Unable to fetch exact merge-group commits from ${remote}: ${
          error.stderr?.toString().trim() || error.message
        }`,
      );
    }
  }
  const unresolved = required.filter((commit) => !hasRef(cwd, commit));
  if (unresolved.length > 0) {
    throw new Error(`Exact merge-group commits remain unavailable: ${unresolved.join(', ')}.`);
  }
}

export async function resolveMergeGroupEntries({
  apiUrl = process.env.GITHUB_API_URL
    ? `${process.env.GITHUB_API_URL}/graphql`
    : 'https://api.github.com/graphql',
  event,
  fetchImpl = fetch,
  repository = process.env.GITHUB_REPOSITORY,
  cwd = REPOSITORY_ROOT,
  isAncestor = (ancestor, descendant) => gitIsAncestor(cwd, ancestor, descendant),
  fetchCommits = false,
}) {
  const eventHead = event?.merge_group?.head_sha ?? event?.merge_group?.headSha;
  const baseRef = event?.merge_group?.base_ref ?? event?.merge_group?.baseRef ?? 'refs/heads/main';
  if (!eventHead || !repository) {
    throw new Error('merge_group event must provide head_sha and GITHUB_REPOSITORY.');
  }
  const [owner, name] = repository.split('/');
  if (!owner || !name) {
    throw new Error(`Invalid repository identifier: ${repository}`);
  }
  const entries = [];
  let after;
  let matchedIndex = -1;
  let pageCount = 0;
  for (;;) {
    pageCount += 1;
    if (pageCount > 100) {
      throw new Error('GitHub merge queue response exceeded the bounded page limit.');
    }
    const response = await fetchImpl(apiUrl, {
      body: JSON.stringify({
        query: MERGE_QUEUE_QUERY,
        variables: {
          after: after ?? null,
          branch: baseRef.replace(/^refs\/heads\//, ''),
          name,
          owner,
        },
      }),
      headers: {
        accept: 'application/json',
        authorization: process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : undefined,
        'content-type': 'application/json',
      },
      method: 'POST',
    });
    if (!response.ok) {
      throw new Error(`GitHub merge queue query failed with HTTP ${response.status}.`);
    }
    const payload = await response.json();
    if (payload.errors?.length) {
      throw new Error(
        `GitHub merge queue query failed: ${payload.errors.map(({ message }) => message).join('; ')}`,
      );
    }
    const queue = payload.data?.repository?.mergeQueue?.entries;
    if (!Array.isArray(queue?.nodes)) {
      throw new Error('GitHub merge queue response did not contain entries.');
    }
    entries.push(...queue.nodes);
    matchedIndex = entries.findIndex((entry) => entry.headCommit?.oid === eventHead);
    if (matchedIndex >= 0) {
      break;
    }
    if (!queue.pageInfo?.hasNextPage || !queue.pageInfo.endCursor) {
      break;
    }
    after = queue.pageInfo.endCursor;
  }
  if (matchedIndex < 0) {
    throw new Error(
      `No merge queue entry exactly matched event head ${eventHead}; refusing aggregate validation.`,
    );
  }
  const selected = entries.slice(0, matchedIndex + 1);
  if (fetchCommits) {
    ensureMergeGroupCommits(cwd, [
      eventHead,
      ...selected.flatMap(({ headCommit, pullRequest }) => [
        headCommit?.oid,
        pullRequest?.headRefOid,
        pullRequest?.baseRefOid,
      ]),
    ]);
  }
  for (const entry of selected) {
    if (
      !entry.headCommit?.oid ||
      !entry.pullRequest?.headRefOid ||
      !entry.pullRequest?.baseRefOid
    ) {
      throw new Error(
        'Merge queue entry is missing exact synthetic or pull request head/base SHAs.',
      );
    }
    if (!(await isAncestor(entry.headCommit.oid, eventHead))) {
      throw new Error(
        `Merge queue entry ${entry.headCommit.oid} is not an ancestor of event head ${eventHead}.`,
      );
    }
  }
  return selected;
}

export function checkPullRequest(options) {
  return classifyPullRequest(options);
}

function parseArgs(argv) {
  const options = { bootstrap: false, mergeGroup: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--bootstrap') {
      options.bootstrap = true;
    } else if (argument === '--merge-group') {
      options.mergeGroup = true;
    } else if (
      argument === '--base' ||
      argument === '--head' ||
      argument === '--event-file' ||
      argument === '--pr-body-file'
    ) {
      const optionName =
        argument === '--pr-body-file' ? 'prbodyfile' : argument.slice(2).replace('-', '');
      options[optionName] = argv[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.mergeGroup) {
    const eventPath = options.eventfile ?? process.env.GITHUB_EVENT_PATH;
    if (!eventPath) {
      throw new Error('--merge-group requires --event-file or GITHUB_EVENT_PATH.');
    }
    const event = JSON.parse(readFileSync(eventPath, 'utf8'));
    const entries = await resolveMergeGroupEntries({
      cwd: REPOSITORY_ROOT,
      event,
      fetchCommits: true,
    });
    const failures = [];
    for (const entry of entries) {
      const result = classifyPullRequest({
        base: entry.pullRequest.baseRefOid,
        bootstrap: options.bootstrap,
        head: entry.pullRequest.headRefOid,
        prBody: entry.pullRequest.body,
        cwd: REPOSITORY_ROOT,
      });
      failures.push(...result.errors.map((error) => `PR #${entry.pullRequest.number}: ${error}`));
    }
    if (failures.length) {
      throw new Error(failures.join('\n'));
    }
    console.log(`UI contract merge queue check passed for ${entries.length} PR entry/entries.`);
    return;
  }

  if (!options.base || !options.head) {
    throw new Error('Both --base and --head are required unless --merge-group is used.');
  }
  const prBody = options.prbodyfile
    ? readFileSync(options.prbodyfile, 'utf8')
    : options.eventfile
      ? JSON.parse(readFileSync(options.eventfile, 'utf8')).pull_request?.body
      : undefined;
  const result = classifyPullRequest({
    base: options.base,
    bootstrap: options.bootstrap,
    head: options.head,
    prBody,
    cwd: REPOSITORY_ROOT,
  });
  if (result.errors.length) {
    throw new Error(result.errors.join('\n'));
  }
  console.log(
    `UI contract PR check passed (${result.categories.join(', ') || 'supporting-only'}).`,
  );
}

function isEntryPoint() {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((error) => {
    console.error(`UI contract PR check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
