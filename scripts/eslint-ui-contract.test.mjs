import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ESLint } from 'eslint';
import ts from 'typescript-eslint';
import uiContract from './eslint-ui-contract.mjs';

const repositoryRoot = new URL('..', import.meta.url).pathname;
const eslint = new ESLint({ cwd: repositoryRoot });

async function lint(source, name = 'scripts/ui-contract-fixture.tsx', ruleOptions) {
  const runner = ruleOptions
    ? new ESLint({
        cwd: repositoryRoot,
        overrideConfigFile: true,
        overrideConfig: [
          {
            files: ['**/*.tsx'],
            languageOptions: {
              ecmaVersion: 'latest',
              parser: ts.parser,
              sourceType: 'module',
            },
            plugins: { 'ui-contract': uiContract },
            rules: {
              'ui-contract/no-visual-style-overrides': ['error', { legacySnapshot: ruleOptions }],
            },
          },
        ],
      })
    : eslint;
  const [result] = await runner.lintText(source, { filePath: name });
  assert.ok(result);
  return result.messages;
}

function violations(messages) {
  return messages.filter(
    ({ ruleId, severity }) => ruleId === 'ui-contract/no-visual-style-overrides' && severity === 2,
  );
}

describe('ui-contract/no-visual-style-overrides', () => {
  it('rejects visual overrides through named aliases and local StyleSheet values', async () => {
    const messages = await lint(`
      import { Button as PrimaryButton } from '@/components/ui/Button';
      import { StyleSheet } from 'react-native';

      const styles = StyleSheet.create({ primary: { color: 'red', margin: 4 } });
      export function Fixture() {
        return <PrimaryButton style={styles.primary}>Save</PrimaryButton>;
      }
    `);

    assert.equal(violations(messages).length, 1);
    assert.match(violations(messages)[0].message, /Button.*tone\/size.*UI-only PR/);
  });

  it('resolves namespace components while respecting a shadowed local namespace', async () => {
    const messages = await lint(`
      import * as UI from '@/components/ui';

      function LocalScope() {
        const UI = { Button: 'local' };
        return <UI.Button style={{ backgroundColor: 'red' }}>Local</UI.Button>;
      }

      export function Fixture() {
        return <UI.Button style={{ backgroundColor: 'red' }}>Canonical</UI.Button>;
      }
    `);

    assert.equal(violations(messages).length, 1);
  });

  it('respects a shadowed local component with the same name as an imported component', async () => {
    const messages = await lint(`
      import { Button } from '@/components/ui/Button';

      function Shadowed() {
        const Button = ({ style }) => <div style={style} />;
        return <Button style={{ color: 'red' }}>Local</Button>;
      }

      export function Fixture() {
        return <Button style={{ color: 'red' }}>Canonical</Button>;
      }
    `);

    assert.equal(violations(messages).length, 1);
  });

  it('allows public variants, layout styles, container styles, and unrelated components', async () => {
    const messages = await lint(`
      import { Button } from '@/components/ui/Button';
      import { RadioGroup } from '@/components/ui/RadioGroup';

      function ButtonLike({ style }) {
        return <div style={style} />;
      }

      export function Fixture() {
        return <>
          <Button tone="secondary" size="compact" style={{ margin: 8, width: 120 }}>Save</Button>
          <RadioGroup accessibilityLabel="Choice" onChange={() => {}} value="a" style={{ backgroundColor: 'red' }} />
          <ButtonLike style={{ color: 'red' }} />
        </>;
      }
    `);

    assert.deepEqual(violations(messages), []);
  });

  it('distinguishes control visual style from IconButton target and StateView container style', async () => {
    const messages = await lint(`
      import { IconButton } from '@/components/ui/IconButton';
      import { RadioOption } from '@/components/ui/RadioGroup';
      import { StateView } from '@/components/ui/StateView';
      import { TextField } from '@/components/ui/TextField';

      export function Fixture() {
        return <>
          <IconButton
            accessibilityLabel="More"
            style={{ backgroundColor: 'red', width: 48, height: 48 }}
            visualStyle={{ opacity: 0.5 }}
          />
          <StateView title="Error" style={{ backgroundColor: 'red' }} actionStyle={{ borderColor: 'red' }} />
          <RadioOption option={{ label: 'A', value: 'a' }} style={{ color: 'red' }} />
          <TextField style={{ fontWeight: '600' }} />
        </>;
      }
    `);

    assert.equal(violations(messages).length, 5);
  });

  it('does not inspect unresolved dynamic styles or owner implementation files', async () => {
    const dynamicMessages = await lint(`
      import { Button } from '@/components/ui/Button';
      declare const getStyle: () => unknown;
      export function Fixture() {
        return <Button style={getStyle()}>Save</Button>;
      }
    `);
    assert.deepEqual(violations(dynamicMessages), []);

    const ownerMessages = await lint(
      `
        import { Button } from '@/components/ui/Button';
        export function Fixture() {
          return <Button style={{ color: 'red' }}>Save</Button>;
        }
      `,
      'apps/app/src/components/ui/ColorPickerPanel.tsx',
    );
    assert.deepEqual(violations(ownerMessages), []);
  });

  it('allows an unchanged legacy snapshot entry and reports an edited expression as stale plus new', async () => {
    const snapshot = {
      entries: {
        "scripts/ui-contract-fixture.tsx::Button::style::color::String:'red'": {
          occurrences: 1,
          reason: 'fixture legacy recipe',
          reference: 'scripts/ui-contract-fixture.tsx',
        },
      },
    };
    const unchanged = await lint(
      `
        import { Button } from '@/components/ui/Button';
        export function Fixture() {
          return <Button style={{ color: 'red' }}>Save</Button>;
        }
      `,
      'scripts/ui-contract-fixture.tsx',
      snapshot,
    );
    assert.deepEqual(violations(unchanged), []);

    const edited = await lint(
      `
        import { Button } from '@/components/ui/Button';
        export function Fixture() {
          return <Button style={{ color: 'blue' }}>Save</Button>;
        }
      `,
      'scripts/ui-contract-fixture.tsx',
      snapshot,
    );
    assert.equal(violations(edited).length, 2);
    assert.ok(edited.some(({ message }) => message.includes('stale')));
  });

  it('reports a newly added occurrence and a removed legacy override', async () => {
    const snapshot = {
      entries: {
        "scripts/ui-contract-fixture.tsx::Button::style::color::String:'red'": {
          occurrences: 1,
          reason: 'fixture legacy recipe',
          reference: 'scripts/ui-contract-fixture.tsx',
        },
      },
    };
    const added = await lint(
      `
        import { Button } from '@/components/ui/Button';
        export function Fixture() {
          return <><Button style={{ color: 'red' }}>One</Button><Button style={{ color: 'red' }}>Two</Button></>;
        }
      `,
      'scripts/ui-contract-fixture.tsx',
      snapshot,
    );
    assert.equal(violations(added).length, 1);

    const removed = await lint(
      `
        import { Button } from '@/components/ui/Button';
        export function Fixture() {
          return <Button>Save</Button>;
        }
      `,
      'scripts/ui-contract-fixture.tsx',
      snapshot,
    );
    assert.equal(violations(removed).length, 1);
    assert.ok(removed.some(({ message }) => message.includes('stale')));
  });

  it('resolves local style spreads, repeated style members, JSX props spreads, and string keys', async () => {
    const messages = await lint(`
      import { Button } from '@/components/ui/Button';

      const styles = { first: { color: 'red' }, second: { backgroundColor: 'blue' } };
      const key = 'margin';
      const keyedStyles = { margin: { color: 'red' } };
      const props = { style: { opacity: 0.5 } };
      export function Fixture() {
        return <>
          <Button style={{ ...styles.first, ...styles.second }}>Spread</Button>
          <Button {...props}>Props</Button>
          <Button style={{ ['borderColor']: 'red' }}>Computed</Button>
          <Button style={{ color: 'red' }}>Color</Button>
          <Button style={{ [key]: 8 }}>Dynamic key</Button>
          <Button style={keyedStyles[key]}>Dynamic member</Button>
        </>;
      }
    `);

    assert.equal(violations(messages).length, 5);
  });
});
