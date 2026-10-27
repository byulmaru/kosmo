import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  checkPullRequest,
  ensureMergeGroupCommits,
  resolveMergeGroupEntries,
} from './check-ui-contract-pr.mjs';

const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const CHECKER_PATH = 'scripts/check-ui-contract-pr.mjs';
const SVG_OWNER_ENTRIES = [
  'apps/app/src/components/ui/StateView.tsx',
  'apps/app/src/components/ui/BottomTabBarIcon.tsx',
  'apps/app/src/components/ui/RadioGroup.tsx',
  'apps/app/src/components/ui/ColorPickerPanel.tsx',
  'apps/app/src/components/reaction/ReactionPendingSpinner.tsx',
  'apps/app/src/components/post/PostComposer.tsx',
];
const temporaryRepositories = [];

function svgOwnerConfig(entries, marker = '') {
  return `const svgOwnerFiles = ${JSON.stringify(entries, null, 2)};\n${marker}export default [];\n`;
}

function customIconBody() {
  return [
    '- 고려한 Lucide 대안: Lucide glyph를 검토했지만 동일한 형태가 없습니다.',
    '- 미채택 이유: 이 UI는 제품 전용 경로 geometry가 필요합니다.',
  ].join('\n');
}

async function createCustomIconFixture({
  iconPath = 'apps/app/src/components/icons/CustomBadge.tsx',
  configEntries = [...SVG_OWNER_ENTRIES, iconPath],
  configMarker = '',
  includeStory = true,
} = {}) {
  const iconImport = `@/${iconPath.slice('apps/app/src/'.length).replace(/\.[^.]+$/, '')}`;
  const root = await createRepository({
    [CHECKER_PATH]: 'export {};\n',
    'eslint.config.mjs': svgOwnerConfig(SVG_OWNER_ENTRIES),
    [iconPath]: 'export const CustomBadge = () => null;\n',
  });
  await writeRepositoryFile(root, 'eslint.config.mjs', svgOwnerConfig(configEntries, configMarker));
  await writeRepositoryFile(
    root,
    iconPath,
    'import Svg, { Path } from \'react-native-svg\';\nexport const CustomBadge = () => <Svg><Path d="M0 0" /></Svg>;\n',
  );
  if (includeStory) {
    await writeRepositoryFile(
      root,
      'apps/app/src/stories/components/CustomBadge.stories.tsx',
      `import { CustomBadge } from '${iconImport}';\nexport default { component: CustomBadge };\n`,
    );
  }
  commit(root, 'custom icon admission');
  const bodyPath = path.join(root, 'pr-body.md');
  const eventPath = path.join(root, 'pull-request-event.json');
  await writeFile(bodyPath, customIconBody(), 'utf8');
  await writeFile(eventPath, JSON.stringify({ pull_request: { body: customIconBody() } }), 'utf8');
  return { root, bodyPath, eventPath, ...refs(root) };
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function createRepository(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'ui-contract-pr-'));
  temporaryRepositories.push(root);
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'test@example.invalid']);
  git(root, ['config', 'user.name', 'Test']);
  for (const [file, source] of Object.entries(files)) {
    await writeRepositoryFile(root, file, source);
  }
  git(root, ['add', '.']);
  git(root, ['commit', '-m', 'base']);
  return root;
}

async function writeRepositoryFile(root, file, source) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source, 'utf8');
}

function commit(cwd, message) {
  git(cwd, ['add', '.']);
  git(cwd, ['commit', '-m', message]);
}

function refs(cwd) {
  return {
    base: git(cwd, ['rev-parse', 'HEAD^']).trim(),
    head: git(cwd, ['rev-parse', 'HEAD']).trim(),
  };
}

function runCli(cwd, args, scriptPath = path.join(repositoryRoot, CHECKER_PATH)) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, UI_CONTRACT_REPOSITORY_ROOT: cwd },
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe('check-ui-contract-pr', () => {
  it('requires explicit base and head refs', () => {
    const result = runCli(repositoryRoot, []);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Both --base and --head are required/);
  });

  it('executes the real CLI through a symlink and a path containing spaces', async () => {
    const root = await createRepository({ 'README.md': 'base\n' });
    await writeRepositoryFile(root, 'README.md', 'head\n');
    commit(root, 'fixture change');
    const cliDirectory = await mkdtemp(path.join(tmpdir(), 'ui contract cli-'));
    temporaryRepositories.push(cliDirectory);
    const linkedScript = path.join(cliDirectory, 'check-ui-contract-pr.mjs');
    await symlink(path.join(repositoryRoot, CHECKER_PATH), linkedScript);
    const result = runCli(
      root,
      [`--base`, refs(root).base, `--head`, refs(root).head],
      linkedScript,
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UI contract PR check passed/);
  });

  it('allows a layout-only feature change', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        'export const Feature = () => <div style={{ margin: 1 }} />;\n',
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      'export const Feature = () => <div style={{ margin: 2 }} />;\n',
    );
    commit(root, 'layout change');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['feature']);
  });

  it('treats removal of a visual property and its solely-used token import as UI cleanup', async () => {
    const root = await createRepository({
      'apps/app/src/app/index.tsx':
        "import { radii, spacing } from '@/theme/tokens';\nimport { StyleSheet } from 'react-native';\nconst styles = StyleSheet.create({ startButton: { borderRadius: radii.sm, height: 48, width: 200, marginTop: spacing.sm } });\nexport const Index = () => null;\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/app/index.tsx',
      "import { spacing } from '@/theme/tokens';\nimport { StyleSheet } from 'react-native';\nconst styles = StyleSheet.create({ startButton: { height: 48, width: 200, marginTop: spacing.sm } });\nexport const Index = () => null;\n",
    );
    commit(root, 'remove redundant visual override');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['ui']);
  });

  it('allows the initial policy bootstrap with an existing UI cleanup only', async () => {
    const root = await createRepository({
      'eslint.config.mjs': 'export default [];\n',
      'apps/app/src/app/index.tsx':
        "import { radii, spacing } from '@/theme/tokens';\nimport { StyleSheet } from 'react-native';\nconst styles = StyleSheet.create({ button: { borderRadius: radii.sm, height: 48, marginTop: spacing.sm } });\nexport const Index = () => null;\n",
    });
    await writeRepositoryFile(root, CHECKER_PATH, 'export {};\n');
    await writeRepositoryFile(root, 'eslint.config.mjs', 'export default [{ rules: {} }];\n');
    await writeRepositoryFile(
      root,
      'apps/app/src/app/index.tsx',
      "import { spacing } from '@/theme/tokens';\nimport { StyleSheet } from 'react-native';\nconst styles = StyleSheet.create({ button: { height: 48, marginTop: spacing.sm } });\nexport const Index = () => null;\n",
    );
    commit(root, 'initial policy with cleanup');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories.sort(), ['policy', 'ui']);
  });

  it('does not treat unrelated data fields as visual style changes', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        "const metadata = { color: 'red' };\nexport const Feature = () => <div>{metadata.color}</div>;\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "const metadata = { color: 'blue' };\nexport const Feature = () => <div>{metadata.color}</div>;\n",
    );
    commit(root, 'data color change');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['feature']);
  });

  it('allows an owner-only visual change and derives a catalog owner from a story', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        "export const Feature = () => <div style={{ color: 'red' }} />;\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "export const Feature = () => <div style={{ color: 'blue' }} />;\n",
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/stories/components/Feature.stories.tsx',
      "import { Feature } from '@/components/Feature';\nexport default { component: Feature };\n",
    );
    commit(root, 'cataloged UI change');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['ui']);
  });

  it('requires a story catalog entry for a new ui source', async () => {
    const root = await createRepository({ 'README.md': 'fixture\n' });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/ui/NewButton.tsx',
      "export const NewButton = () => <div style={{ color: 'blue' }} />;\n",
    );
    commit(root, 'uncataloged ui source');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('no component/pattern story catalog')));
  });

  it('accepts a platform sibling of an existing cataloged source', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        "export const Feature = () => <div style={{ color: 'red' }} />;\n",
      'apps/app/src/stories/components/Feature.stories.tsx':
        "import { Feature } from '@/components/Feature';\nexport default { component: Feature };\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.native.tsx',
      "export const Feature = () => <div style={{ color: 'blue' }} />;\n",
    );
    commit(root, 'platform sibling ui source');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['ui']);
  });

  it('rejects a new cataloged visual source with Relay integration', async () => {
    const root = await createRepository({ 'README.md': 'fixture\n' });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "import { graphql } from 'react-relay';\nconst query = graphql`query FeatureQuery { viewer { id } }`;\nexport const Feature = () => <div style={{ color: 'blue' }} />;\n",
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/stories/components/Feature.stories.tsx',
      "import { Feature } from '@/components/Feature';\nexport default { component: Feature };\n",
    );
    commit(root, 'new mixed source');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(
      result.errors.some((error) => error.includes('new cataloged source with Relay/route')),
    );
  });

  it('treats known feature-flag integration as mixed runtime logic', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        "import { useFeatureFlag } from '@/components/FeatureFlagsContext';\nexport const Feature = () => <div style={{ color: 'red' }}>{useFeatureFlag('nightshade')}</div>;\n",
      'apps/app/src/stories/components/Feature.stories.tsx':
        "import { Feature } from '@/components/Feature';\nexport default { component: Feature };\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "import { useFeatureFlag } from '@/components/FeatureFlagsContext';\nexport const Feature = () => <div style={{ color: 'blue' }}>{useFeatureFlag('nightshade')}</div>;\n",
    );
    commit(root, 'flag source visual update');
    let result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);

    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "import { useFeatureFlag } from '@/components/FeatureFlagsContext';\nexport const Feature = () => <div style={{ color: 'green' }}>{useFeatureFlag('new-rollout')}</div>;\n",
    );
    commit(root, 'flag key and visual update');
    result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('same source changes visual contract')));
  });

  it('retains mixed classification when a known feature-flag integration is removed', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        "import { useFeatureFlag } from '@/components/FeatureFlagsContext';\nexport const Feature = () => <div style={{ color: 'red' }}>{useFeatureFlag('nightshade')}</div>;\n",
      'apps/app/src/stories/components/Feature.stories.tsx':
        "import { Feature } from '@/components/Feature';\nexport default { component: Feature };\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "export const Feature = () => <div style={{ color: 'blue' }} />;\n",
    );
    commit(root, 'remove flag integration and update visual');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('same source changes visual contract')));
  });

  it('rejects visual and feature edits in one non-owner source file', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx':
        'const version = 1;\nexport const Feature = () => <div style={{ margin: 1 }} />;\n',
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "const version = 2;\nexport const Feature = () => <div style={{ color: 'blue' }} />;\n",
    );
    commit(root, 'mixed change');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('same source changes visual contract')));
  });

  it('rejects UI and feature files mixed in one PR', async () => {
    const root = await createRepository({
      'apps/app/src/components/ui/Button.tsx':
        "export const Button = () => <div style={{ color: 'red' }} />;\n",
      'apps/app/src/components/Feature.tsx': 'export const Feature = () => <div />;\n',
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/ui/Button.tsx',
      "export const Button = () => <div style={{ color: 'blue' }} />;\n",
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      'export const Feature = () => <span />;\n',
    );
    commit(root, 'mixed PR');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('mixes UI contract changes')));
  });

  it('keeps deleted or renamed UI owners in the UI classification', async () => {
    const root = await createRepository({
      'apps/app/src/components/ui/Button.tsx':
        "export const Button = () => <div style={{ color: 'red' }} />;\n",
    });
    git(root, [
      'mv',
      'apps/app/src/components/ui/Button.tsx',
      'apps/app/src/components/ui/PrimaryButton.tsx',
    ]);
    commit(root, 'rename owner');
    let result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['ui']);

    await writeRepositoryFile(root, 'apps/app/src/components/ui/PrimaryButton.tsx', '');
    git(root, ['add', '.']);
    git(root, ['commit', '-m', 'delete owner']);
    result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
  });

  it('rejects a story that does not admit a production component', async () => {
    const root = await createRepository({
      'apps/app/src/components/Feature.tsx': 'export const Feature = () => null;\n',
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/stories/components/Unrelated.stories.tsx',
      "export default { title: 'Unrelated' };\n",
    );
    commit(root, 'unrelated story');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('no production component import')));
  });

  it('allows a dedicated policy-only change once the base checker exists', async () => {
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'scripts/ui-contract-legacy.json': '{"version":1,"entries":{}}\n',
    });
    await writeRepositoryFile(
      root,
      'scripts/ui-contract-legacy.json',
      '{"version":1,"entries":{"new":{}}}\n',
    );
    commit(root, 'policy self exemption');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['policy']);
  });

  it('does not let a policy change self-exempt a mixed runtime PR', async () => {
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'scripts/ui-contract-legacy.json': '{"version":1,"entries":{}}\n',
      'apps/app/src/components/Feature.tsx':
        'export const Feature = () => <div style={{ margin: 1 }} />;\n',
    });
    await writeRepositoryFile(
      root,
      'scripts/ui-contract-legacy.json',
      '{"version":1,"entries":{"new":{}}}\n',
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      'export const Feature = () => <div style={{ margin: 2 }} />;\n',
    );
    commit(root, 'mixed policy and runtime change');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.ok(result.errors.some((error) => error.includes('mixes enforcement-policy changes')));
  });

  it('allows a custom icon, owner registration, canonical component, story, and review body together', async () => {
    const fixture = await createCustomIconFixture();
    const result = runCli(fixture.root, [
      '--base',
      fixture.base,
      '--head',
      fixture.head,
      '--event-file',
      fixture.eventPath,
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /UI contract PR check passed/);
  });

  it('keeps registered custom owners covered in follow-up source changes', async () => {
    const fixture = await createCustomIconFixture();
    await writeRepositoryFile(
      fixture.root,
      'apps/app/src/components/icons/CustomBadge.tsx',
      'import Svg, { Path } from \'react-native-svg\';\nexport const CustomBadge = () => <Svg><Path d="M1 1" /></Svg>;\n',
    );
    git(fixture.root, ['add', 'apps/app/src/components/icons/CustomBadge.tsx']);
    git(fixture.root, ['commit', '-m', 'custom icon geometry follow-up']);
    const followUpHead = git(fixture.root, ['rev-parse', 'HEAD']).trim();
    const missingBody = checkPullRequest({
      base: fixture.head,
      head: followUpHead,
      cwd: fixture.root,
    });
    assert.ok(missingBody.errors.some((error) => error.includes('고려한 Lucide 대안')));

    const withBody = checkPullRequest({
      base: fixture.head,
      head: followUpHead,
      cwd: fixture.root,
      prBody: customIconBody(),
    });
    assert.deepEqual(withBody.errors, []);
    assert.deepEqual(withBody.categories, ['ui']);

    await writeRepositoryFile(
      fixture.root,
      'apps/app/src/components/icons/CustomBadge.tsx',
      "import { graphql } from 'react-relay';\nimport Svg, { Path } from 'react-native-svg';\nconst query = graphql`query CustomBadgeQuery { viewer { id } }`;\nexport const CustomBadge = () => <Svg style={{ color: 'red' }}><Path d=\"M2 2\" /></Svg>;\n",
    );
    git(fixture.root, ['add', 'apps/app/src/components/icons/CustomBadge.tsx']);
    git(fixture.root, ['commit', '-m', 'custom icon runtime mixed follow-up']);
    const mixed = checkPullRequest({
      base: fixture.head,
      head: git(fixture.root, ['rev-parse', 'HEAD']).trim(),
      cwd: fixture.root,
      prBody: customIconBody(),
    });
    assert.ok(mixed.errors.some((error) => error.includes('same source changes visual contract')));
  });

  it('requires both custom icon review fields and rejects missing or placeholder bodies', async () => {
    const fixture = await createCustomIconFixture();
    for (const body of [
      '',
      '- 고려한 Lucide 대안: 없음\n- 미채택 이유: 해당 없음\n',
      '<!-- - 고려한 Lucide 대안: 실제 대안 -->\n<!-- - 미채택 이유: 실제 이유 -->',
    ]) {
      await writeFile(fixture.bodyPath, body, 'utf8');
      const result = runCli(fixture.root, [
        '--base',
        fixture.base,
        '--head',
        fixture.head,
        '--pr-body-file',
        fixture.bodyPath,
      ]);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /고려한 Lucide 대안/);
    }
  });

  it('rejects custom icon admission mixed with feature source changes', async () => {
    const fixture = await createCustomIconFixture();
    await writeRepositoryFile(
      fixture.root,
      'apps/app/src/components/Feature.tsx',
      'export const Feature = () => <div />;\n',
    );
    commit(fixture.root, 'feature integration');
    const result = checkPullRequest({
      base: fixture.base,
      head: git(fixture.root, ['rev-parse', 'HEAD']).trim(),
      cwd: fixture.root,
      prBody: customIconBody(),
    });
    assert.ok(result.errors.some((error) => error.includes('mixes UI contract changes')));
  });

  it('rejects custom icon admission when config rules are weakened', async () => {
    const fixture = await createCustomIconFixture({
      configMarker: "const policyMarker = 'head';\n",
    });
    const result = checkPullRequest({
      ...fixture,
      cwd: fixture.root,
      prBody: customIconBody(),
    });
    assert.ok(result.errors.some((error) => error.includes('enforcement-policy')));
  });

  it('rejects an owner registration without a changed source and representative story', async () => {
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'eslint.config.mjs': svgOwnerConfig(SVG_OWNER_ENTRIES),
    });
    await writeRepositoryFile(
      root,
      'eslint.config.mjs',
      svgOwnerConfig([...SVG_OWNER_ENTRIES, 'apps/app/src/components/ui/MissingIcon.tsx']),
    );
    commit(root, 'unmatched icon owner registration');
    const result = checkPullRequest({ ...refs(root), cwd: root, prBody: customIconBody() });
    assert.ok(result.errors.some((error) => error.includes('must be added or modified')));
  });

  it('rejects a test fixture path as a custom icon owner', async () => {
    const fixture = await createCustomIconFixture({
      iconPath: 'apps/app/src/components/ui/CustomIcon.test.tsx',
    });
    const result = checkPullRequest({
      ...fixture,
      cwd: fixture.root,
      prBody: customIconBody(),
    });
    assert.ok(result.errors.some((error) => error.includes('exact components/* source paths')));
  });

  it('requires the custom icon body when an existing BottomTabBarIcon owner changes', async () => {
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'eslint.config.mjs': svgOwnerConfig(SVG_OWNER_ENTRIES),
      'apps/app/src/components/ui/BottomTabBarIcon.tsx':
        'export const BottomTabBarIcon = () => null;\n',
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/ui/BottomTabBarIcon.tsx',
      'export const BottomTabBarIcon = () => <span />;\n',
    );
    commit(root, 'modify known custom icon owner');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.ok(result.errors.some((error) => error.includes('고려한 Lucide 대안')));
  });

  it('allows legacy snapshot narrowing with the corresponding visual cleanup', async () => {
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'scripts/ui-contract-legacy.json':
        '{"version":1,"entries":{"apps/app/src/components/Feature.tsx::Feature::style::color::String:\'red\'":{"occurrences":1,"reason":"legacy","reference":"docs/design/x.md"}}}\n',
      'apps/app/src/components/Feature.tsx':
        "export const Feature = () => <Feature style={{ color: 'red', margin: 1 }} />;\n",
    });
    await writeRepositoryFile(
      root,
      'scripts/ui-contract-legacy.json',
      '{"version":1,"entries":{}}\n',
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      'export const Feature = () => <Feature style={{ margin: 1 }} />;\n',
    );
    commit(root, 'legacy cleanup');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['feature']);
  });

  it('allows a screen story as supporting evidence without classifying it as feature work', async () => {
    const root = await createRepository({
      'apps/app/src/stories/screens/Home.stories.tsx': "export default { title: 'Home' };\n",
    });
    await writeRepositoryFile(
      root,
      'apps/app/src/stories/screens/Home.stories.tsx',
      "export default { title: 'Home updated' };\n",
    );
    commit(root, 'screen story support');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, []);
  });

  it('does not let a screen story catalog a new visual source', async () => {
    const root = await createRepository({ 'README.md': 'fixture\n' });
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "export const Feature = () => <div style={{ color: 'blue' }} />;\n",
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/stories/screens/Feature.stories.tsx',
      "import { Feature } from '@/components/Feature';\nexport default { component: Feature };\n",
    );
    commit(root, 'screen story cannot own source');
    const result = checkPullRequest({ ...refs(root), bootstrap: true, cwd: root });
    assert.ok(result.errors.some((error) => error.includes('no component/pattern story catalog')));
  });

  it('does not classify unrelated package metadata as enforcement policy', async () => {
    const root = await createRepository({
      'package.json': '{"scripts":{"test":"node test.mjs"}}\n',
    });
    await writeRepositoryFile(
      root,
      'package.json',
      '{"private":true,"scripts":{"test":"node test.mjs"}}\n',
    );
    commit(root, 'unrelated package metadata');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['feature']);
  });

  it('treats disabling root lint:eslint as policy when mixed with feature work', async () => {
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'package.json': JSON.stringify({
        scripts: {
          'lint:eslint': 'eslint --max-warnings 0 .',
          test: 'pnpm test:eslint',
          'test:eslint': `node ${CHECKER_PATH.replace('.mjs', '.test.mjs')}`,
        },
      }),
      'apps/app/src/components/Feature.tsx':
        'export const Feature = () => <div style={{ margin: 1 }} />;\n',
    });
    await writeRepositoryFile(
      root,
      'package.json',
      JSON.stringify({
        scripts: {
          'lint:eslint': 'echo skipped',
          test: 'pnpm test:eslint',
          'test:eslint': `node ${CHECKER_PATH.replace('.mjs', '.test.mjs')}`,
        },
      }),
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      'export const Feature = () => <div style={{ margin: 2 }} />;\n',
    );
    commit(root, 'disable eslint with feature change');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.ok(result.errors.some((error) => error.includes('mixes enforcement-policy changes')));
  });

  it('matches legacy cleanup by visual fingerprint while retaining duplicate values', async () => {
    const redKey = "apps/app/src/components/Feature.tsx::Feature::style::color::String:'red'";
    const blueKey = "apps/app/src/components/Feature.tsx::Feature::style::color::String:'blue'";
    const root = await createRepository({
      [CHECKER_PATH]: 'export {};\n',
      'scripts/ui-contract-legacy.json': JSON.stringify({
        version: 1,
        entries: {
          [redKey]: { occurrences: 1, reason: 'legacy red', reference: 'docs/design/x.md' },
          [blueKey]: { occurrences: 2, reason: 'legacy blue', reference: 'docs/design/x.md' },
        },
      }),
      'apps/app/src/components/Feature.tsx':
        "export const Feature = () => <><Feature style={{ color: 'red' }} /><Feature style={{ color: 'blue' }} /><Feature style={{ color: 'blue' }} /></>;\n",
    });
    await writeRepositoryFile(
      root,
      'scripts/ui-contract-legacy.json',
      JSON.stringify({
        version: 1,
        entries: {
          [blueKey]: { occurrences: 2, reason: 'legacy blue', reference: 'docs/design/x.md' },
        },
      }),
    );
    await writeRepositoryFile(
      root,
      'apps/app/src/components/Feature.tsx',
      "export const Feature = () => <><Feature style={{ color: 'blue' }} /><Feature style={{ color: 'blue' }} /></>;\n",
    );
    commit(root, 'remove one exact legacy visual value');
    const result = checkPullRequest({ ...refs(root), cwd: root });
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.categories, ['feature']);
  });
});

describe('merge queue resolution', () => {
  const response = (nodes) => ({
    ok: true,
    status: 200,
    json: async () => ({
      data: {
        repository: {
          mergeQueue: { entries: { nodes, pageInfo: { hasNextPage: false } } },
        },
      },
    }),
  });

  it('fetches exact missing merge-group commits from the local origin remote', async () => {
    const producer = await createRepository({ 'README.md': 'base\n' });
    const remote = await mkdtemp(path.join(tmpdir(), 'ui-contract-remote-'));
    temporaryRepositories.push(remote);
    git(remote, ['init', '--bare']);
    git(producer, ['remote', 'add', 'origin', remote]);
    git(producer, ['push', 'origin', 'main']);

    const checkout = await mkdtemp(path.join(tmpdir(), 'ui-contract-checkout-'));
    temporaryRepositories.push(checkout);
    git(checkout, ['clone', remote, '.']);
    await writeRepositoryFile(producer, 'README.md', 'fetched\n');
    commit(producer, 'remote commit');
    const missingCommit = git(producer, ['rev-parse', 'HEAD']).trim();
    git(producer, ['push', 'origin', 'main']);

    ensureMergeGroupCommits(checkout, [missingCommit]);
    assert.equal(git(checkout, ['rev-parse', `${missingCommit}^{commit}`]).trim(), missingCommit);
  });

  it('matches the exact event head and returns predecessor PR entries individually', async () => {
    const entries = await resolveMergeGroupEntries({
      event: { merge_group: { base_ref: 'refs/heads/main', head_sha: 'synthetic-2' } },
      fetchImpl: async () =>
        response([
          {
            headCommit: { oid: 'synthetic-1' },
            pullRequest: {
              number: 1,
              baseRefOid: 'base-1',
              headRefOid: 'head-1',
              body: '- 고려한 Lucide 대안: existing glyph\n- 미채택 이유: existing geometry',
            },
          },
          {
            headCommit: { oid: 'synthetic-2' },
            pullRequest: { number: 2, baseRefOid: 'base-2', headRefOid: 'head-2' },
          },
          {
            headCommit: { oid: 'synthetic-3' },
            pullRequest: { number: 3, baseRefOid: 'base-3', headRefOid: 'head-3' },
          },
        ]),
      repository: 'byulmaru/kosmo',
      isAncestor: () => true,
    });
    assert.deepEqual(
      entries.map(({ pullRequest }) => pullRequest.number),
      [1, 2],
    );
    assert.equal(
      entries[0].pullRequest.body,
      '- 고려한 Lucide 대안: existing glyph\n- 미채택 이유: existing geometry',
    );
  });

  it('fails closed for a stale or unknown merge queue head', async () => {
    await assert.rejects(
      resolveMergeGroupEntries({
        event: { merge_group: { head_sha: 'unknown' } },
        fetchImpl: async () => response([{ headCommit: { oid: 'stale' }, pullRequest: {} }]),
        repository: 'byulmaru/kosmo',
      }),
      /No merge queue entry exactly matched event head unknown/,
    );
  });

  it('accepts an exact first-page match without requiring unrelated queue pages', async () => {
    const entries = await resolveMergeGroupEntries({
      event: { merge_group: { head_sha: 'synthetic-1' } },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            repository: {
              mergeQueue: {
                entries: {
                  nodes: [
                    {
                      headCommit: { oid: 'synthetic-1' },
                      pullRequest: { number: 1, baseRefOid: 'base-1', headRefOid: 'head-1' },
                    },
                  ],
                  pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
                },
              },
            },
          },
        }),
      }),
      repository: 'byulmaru/kosmo',
      isAncestor: () => true,
    });
    assert.deepEqual(
      entries.map(({ pullRequest }) => pullRequest.number),
      [1],
    );
  });

  it('uses local ancestry without rejecting repositories with more than 100 commits', async () => {
    const root = await createRepository({ 'README.md': '0\n' });
    for (let index = 1; index <= 101; index += 1) {
      await writeRepositoryFile(root, 'README.md', `${index}\n`);
      commit(root, `history ${index}`);
    }
    const eventHead = git(root, ['rev-parse', 'HEAD']).trim();
    const entries = await resolveMergeGroupEntries({
      cwd: root,
      event: { merge_group: { head_sha: eventHead } },
      fetchImpl: async () =>
        response([
          {
            headCommit: { oid: eventHead },
            pullRequest: { number: 1, baseRefOid: 'base-1', headRefOid: 'head-1' },
          },
        ]),
      repository: 'byulmaru/kosmo',
    });
    assert.deepEqual(
      entries.map(({ pullRequest }) => pullRequest.number),
      [1],
    );
  });

  it('rejects a queue predecessor that is not an event-head ancestor', async () => {
    await assert.rejects(
      resolveMergeGroupEntries({
        event: { merge_group: { head_sha: 'synthetic-2' } },
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              repository: {
                mergeQueue: {
                  entries: {
                    nodes: [
                      {
                        headCommit: { oid: 'stale-1' },
                        pullRequest: { number: 1, baseRefOid: 'base-1', headRefOid: 'head-1' },
                      },
                      {
                        headCommit: { oid: 'synthetic-2' },
                        pullRequest: { number: 2, baseRefOid: 'base-2', headRefOid: 'head-2' },
                      },
                    ],
                    pageInfo: { hasNextPage: false },
                  },
                },
              },
            },
          }),
        }),
        repository: 'byulmaru/kosmo',
        isAncestor: (ancestor) => ancestor !== 'stale-1',
      }),
      /not an ancestor/,
    );
  });
});
