import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LEGACY_SNAPSHOT = path.join(REPOSITORY_ROOT, 'scripts/ui-contract-legacy.json');

const VISUAL_STYLE_KEY =
  /^(?:color|background(?:Color|Image)?|border(?:$|[A-Z])|font(?:$|[A-Z])|shadow(?:$|[A-Z])|opacity$|outline(?:$|[A-Z]))/;

const COMPONENTS = new Map([
  ['Button', { styleProps: ['style'], alternative: 'Button tone/size props' }],
  [
    'IconButton',
    {
      styleProps: ['style', 'visualStyle'],
      alternative: 'IconButton feedbackTone/visualSize props',
    },
  ],
  ['TextField', { styleProps: ['style'], alternative: 'TextField contract or a UI-only PR' }],
  ['TextArea', { styleProps: ['style'], alternative: 'TextArea contract or a UI-only PR' }],
  ['RadioOption', { styleProps: ['style'], alternative: 'RadioOption contract or a UI-only PR' }],
  [
    'StateView',
    { styleProps: ['actionStyle'], alternative: 'StateView action contract or a UI-only PR' },
  ],
]);

function moduleName(source, filename) {
  const normalized = source.replaceAll('\\', '/');
  const resolved = normalized.startsWith('.')
    ? path.resolve(path.dirname(filename), source).replaceAll('\\', '/')
    : normalized;
  const match =
    resolved.match(
      /(?:^|\/)apps\/app\/src\/components\/ui\/(Button|IconButton|TextField|RadioGroup|StateView)(?:\.[cm]?[jt]sx?)?$/,
    ) ??
    (normalized.startsWith('@/components/ui/')
      ? normalized.match(
          /(?:^|\/)components\/ui\/(Button|IconButton|TextField|RadioGroup|StateView)(?:\.[cm]?[jt]sx?)?$/,
        )
      : undefined);
  if (match) {
    return match[1];
  }

  const resolvedIsUiBarrel = /(?:^|\/)apps\/app\/src\/components\/ui(?:\/index)?$/.test(resolved);
  const aliasIsUiBarrel = /^@\/components\/ui(?:\/index)?$/.test(normalized);
  if (resolvedIsUiBarrel || aliasIsUiBarrel) {
    return 'barrel';
  }

  return undefined;
}

function importedName(specifier) {
  if (specifier.type !== 'ImportSpecifier') {
    return undefined;
  }

  return specifier.imported.type === 'Identifier'
    ? specifier.imported.name
    : specifier.imported.value;
}

function isUiOwnerFile(filename) {
  const normalized = path.normalize(filename);
  return normalized.includes(
    `${path.sep}apps${path.sep}app${path.sep}src${path.sep}components${path.sep}ui${path.sep}`,
  );
}

function staticPropertyName(node, computed = false) {
  if (!node) {
    return undefined;
  }

  if (node.type === 'Identifier' && !computed) {
    return node.name;
  }

  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }

  return undefined;
}

function unwrapExpression(node) {
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

function findVariable(sourceCode, node, name) {
  let scope = sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(name);
    if (variable) {
      return variable;
    }
    scope = scope.upper;
  }
  return undefined;
}

function relativeFileName(filename) {
  return path.relative(REPOSITORY_ROOT, filename).replaceAll(path.sep, '/');
}

function normalizeTokens(sourceCode, node) {
  return sourceCode
    .getTokens(node)
    .map((token) => `${token.type}:${token.value}`)
    .join('|');
}

function legacyKey(file, component, styleProp, property, value) {
  return [file, component, styleProp, property, value].join('::');
}

function loadLegacyEntries(options) {
  if (options.legacySnapshot && typeof options.legacySnapshot === 'object') {
    return options.legacySnapshot.entries ?? {};
  }

  const snapshotPath = options.legacySnapshotPath
    ? path.resolve(REPOSITORY_ROOT, options.legacySnapshotPath)
    : DEFAULT_LEGACY_SNAPSHOT;
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  return snapshot.entries ?? {};
}

function createRule(context) {
  const sourceCode = context.sourceCode;
  const options = context.options[0] ?? {};
  const legacyEntries = loadLegacyEntries(options);
  const file = relativeFileName(context.filename);
  const seenLegacyEntries = new Map();
  const componentVariables = new WeakMap();
  const namespaceVariables = new WeakMap();
  const resolvingVariables = new Set();

  function resolveVariable(variable) {
    if (!variable || resolvingVariables.has(variable)) {
      return undefined;
    }

    if (componentVariables.has(variable)) {
      return componentVariables.get(variable);
    }

    resolvingVariables.add(variable);
    let component;
    for (const definition of variable.defs ?? []) {
      if (definition.type === 'ImportBinding') {
        const declaration = definition.parent;
        const source = declaration?.source?.value;
        const module =
          typeof source === 'string' ? moduleName(source, context.filename) : undefined;
        if (module && module !== 'barrel') {
          const imported = importedName(definition.node);
          if (imported && COMPONENTS.has(imported)) {
            component = imported;
            break;
          }
          if (definition.node.type === 'ImportNamespaceSpecifier') {
            namespaceVariables.set(variable, module);
          }
        } else if (module === 'barrel') {
          const imported = importedName(definition.node);
          if (imported && COMPONENTS.has(imported)) {
            component = imported;
            break;
          }
          if (definition.node.type === 'ImportNamespaceSpecifier') {
            namespaceVariables.set(variable, module);
          }
        }
      } else if (definition.type === 'Variable' && definition.node.init) {
        component = resolveExpressionComponent(definition.node.init, definition.name);
        if (component) {
          break;
        }
      }
    }

    resolvingVariables.delete(variable);
    if (component) {
      componentVariables.set(variable, component);
    }
    return component;
  }

  function resolveExpressionComponent(node, anchor) {
    const expression = unwrapExpression(node);
    if (!expression) {
      return undefined;
    }

    if (expression.type === 'Identifier') {
      return resolveVariable(findVariable(sourceCode, anchor ?? expression, expression.name));
    }

    if (
      expression.type === 'MemberExpression' &&
      expression.object.type === 'Identifier' &&
      !expression.optional
    ) {
      const namespace = findVariable(sourceCode, anchor ?? expression, expression.object.name);
      resolveVariable(namespace);
      const module = namespaceVariables.get(namespace);
      const property = staticPropertyName(expression.property, expression.computed);
      return module && property && COMPONENTS.has(property) ? property : undefined;
    }

    return undefined;
  }

  function resolveJsxComponent(node) {
    if (node.type === 'JSXIdentifier') {
      return resolveVariable(findVariable(sourceCode, node, node.name));
    }

    if (
      node.type === 'JSXMemberExpression' &&
      node.object.type === 'JSXIdentifier' &&
      node.property.type === 'JSXIdentifier'
    ) {
      const namespace = findVariable(sourceCode, node, node.object.name);
      resolveVariable(namespace);
      const module = namespaceVariables.get(namespace);
      return module && COMPONENTS.has(node.property.name) ? node.property.name : undefined;
    }

    return undefined;
  }

  function inspectExpression(node, component, propertyNode, seenVariables) {
    const expression = unwrapExpression(node);
    if (!expression) {
      return;
    }

    if (
      expression.type === 'MemberExpression' &&
      expression.object.type === 'Identifier' &&
      !expression.optional
    ) {
      const variable = findVariable(sourceCode, expression, expression.object.name);
      const propertyName = staticPropertyName(expression.property, expression.computed);
      if (!variable || !propertyName || seenVariables.has(variable)) {
        return;
      }
      seenVariables.add(variable);
      try {
        for (const definition of variable.defs ?? []) {
          if (definition.type !== 'Variable' || !definition.node.init) {
            continue;
          }
          let initializer = unwrapExpression(definition.node.init);
          if (
            initializer?.type === 'CallExpression' &&
            initializer.callee.type === 'MemberExpression' &&
            initializer.callee.object.type === 'Identifier' &&
            initializer.callee.object.name === 'StyleSheet' &&
            staticPropertyName(initializer.callee.property, initializer.callee.computed) ===
              'create'
          ) {
            initializer = unwrapExpression(initializer.arguments[0]);
          }
          if (initializer?.type !== 'ObjectExpression') {
            continue;
          }
          const property = initializer.properties.find(
            (candidate) =>
              candidate.type === 'Property' &&
              staticPropertyName(candidate.key, candidate.computed) === propertyName,
          );
          if (property?.type === 'Property') {
            inspectExpression(property.value, component, propertyNode, seenVariables);
          }
        }
      } finally {
        seenVariables.delete(variable);
      }
      return;
    }

    if (expression.type === 'Identifier') {
      const variable = findVariable(sourceCode, expression, expression.name);
      if (!variable || seenVariables.has(variable)) {
        return;
      }
      seenVariables.add(variable);
      try {
        for (const definition of variable.defs ?? []) {
          if (definition.type === 'Variable' && definition.node.init) {
            inspectExpression(definition.node.init, component, propertyNode, seenVariables);
          }
        }
      } finally {
        seenVariables.delete(variable);
      }
      return;
    }

    if (expression.type === 'CallExpression') {
      // shortcut: keep style resolution bounded to same-file static values; extend only for a proven contract path.
      const callee = unwrapExpression(expression.callee);
      if (
        callee?.type === 'MemberExpression' &&
        callee.object.type === 'Identifier' &&
        callee.object.name === 'StyleSheet' &&
        staticPropertyName(callee.property, callee.computed) === 'create'
      ) {
        inspectExpression(expression.arguments[0], component, propertyNode, seenVariables);
      }
      return;
    }

    if (expression.type === 'ArrayExpression') {
      for (const element of expression.elements) {
        if (element) {
          inspectExpression(element, component, propertyNode, seenVariables);
        }
      }
      return;
    }

    if (expression.type === 'ObjectExpression') {
      for (const property of expression.properties) {
        if (property.type === 'SpreadElement') {
          inspectExpression(property.argument, component, propertyNode, seenVariables);
          continue;
        }
        if (property.type !== 'Property') {
          continue;
        }
        const name = staticPropertyName(property.key, property.computed);
        if (name && VISUAL_STYLE_KEY.test(name)) {
          report(property, component, propertyNode, name, property.value);
        }
        if (
          property.value.type === 'ObjectExpression' ||
          property.value.type === 'ArrayExpression'
        ) {
          inspectExpression(property.value, component, propertyNode, seenVariables);
        }
      }
      return;
    }

    if (expression.type === 'ConditionalExpression' || expression.type === 'LogicalExpression') {
      inspectExpression(
        expression.consequent ?? expression.left,
        component,
        propertyNode,
        seenVariables,
      );
      inspectExpression(
        expression.alternate ?? expression.right,
        component,
        propertyNode,
        seenVariables,
      );
      return;
    }

    if (expression.type === 'ArrowFunctionExpression' || expression.type === 'FunctionExpression') {
      if (expression.body.type === 'BlockStatement') {
        for (const statement of expression.body.body) {
          if (statement.type === 'ReturnStatement' && statement.argument) {
            inspectExpression(statement.argument, component, propertyNode, seenVariables);
          }
        }
      } else {
        inspectExpression(expression.body, component, propertyNode, seenVariables);
      }
    }
  }

  function inspectPropExpression(node, component, propertyNode, seenVariables) {
    const expression = unwrapExpression(node);
    if (!expression) {
      return;
    }

    if (expression.type === 'Identifier') {
      const variable = findVariable(sourceCode, expression, expression.name);
      if (!variable || seenVariables.has(variable)) {
        return;
      }
      seenVariables.add(variable);
      try {
        for (const definition of variable.defs ?? []) {
          if (definition.type === 'Variable' && definition.node.init) {
            inspectPropExpression(definition.node.init, component, propertyNode, seenVariables);
          }
        }
      } finally {
        seenVariables.delete(variable);
      }
      return;
    }

    if (expression.type === 'ObjectExpression') {
      for (const property of expression.properties) {
        if (property.type === 'SpreadElement') {
          inspectPropExpression(property.argument, component, propertyNode, seenVariables);
          continue;
        }
        if (
          property.type !== 'Property' ||
          (property.computed && property.key.type !== 'Literal')
        ) {
          continue;
        }
        if (staticPropertyName(property.key, property.computed) === propertyNode) {
          inspectExpression(property.value, component, propertyNode, new Set());
        }
      }
      return;
    }

    if (expression.type === 'ConditionalExpression' || expression.type === 'LogicalExpression') {
      inspectPropExpression(
        expression.consequent ?? expression.left,
        component,
        propertyNode,
        seenVariables,
      );
      inspectPropExpression(
        expression.alternate ?? expression.right,
        component,
        propertyNode,
        seenVariables,
      );
    }
  }

  function report(node, component, propertyNode, property, valueNode) {
    const metadata = COMPONENTS.get(component);
    const key = legacyKey(
      file,
      component,
      propertyNode,
      property,
      normalizeTokens(sourceCode, valueNode),
    );
    const occurrence = (seenLegacyEntries.get(key) ?? 0) + 1;
    seenLegacyEntries.set(key, occurrence);
    const legacyEntry = legacyEntries[key];
    if (legacyEntry && occurrence <= legacyEntry.occurrences) {
      return;
    }
    context.report({
      node,
      message: `${component} ${propertyNode} '${property}' is a visual contract override. Use ${metadata.alternative}; move visual changes to a UI-only PR that updates the canonical component or recipe. Legacy key: ${key}`,
    });
  }

  return {
    JSXOpeningElement(node) {
      if (isUiOwnerFile(context.filename)) {
        return;
      }

      const component = resolveJsxComponent(node.name);
      if (!component) {
        return;
      }

      const metadata = COMPONENTS.get(component);
      for (const styleProp of metadata.styleProps) {
        const attribute = node.attributes.find(
          (candidate) => candidate.type === 'JSXAttribute' && candidate.name.name === styleProp,
        );
        if (attribute?.value?.type === 'JSXExpressionContainer') {
          inspectExpression(attribute.value.expression, component, styleProp, new Set());
        }
        for (const candidate of node.attributes) {
          if (candidate.type === 'JSXSpreadAttribute') {
            inspectPropExpression(candidate.argument, component, styleProp, new Set());
          }
        }
      }
    },
    'Program:exit'(node) {
      for (const [key, entry] of Object.entries(legacyEntries)) {
        if (!key.startsWith(`${file}::`)) {
          continue;
        }
        if ((seenLegacyEntries.get(key) ?? 0) < entry.occurrences) {
          context.report({
            node,
            message: `Legacy UI contract entry is stale because the override is no longer present: ${key}. Remove the entry.`,
          });
        }
      }
    },
  };
}

const plugin = {
  rules: {
    'no-visual-style-overrides': {
      meta: {
        type: 'problem',
        docs: {
          description: 'prevent consumer visual style overrides of canonical UI components',
        },
        schema: [
          {
            type: 'object',
            additionalProperties: true,
          },
        ],
      },
      create: createRule,
    },
  },
};

export default plugin;
