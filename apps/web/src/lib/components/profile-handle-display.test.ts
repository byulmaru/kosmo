import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

const displayComponentFiles = [
  'ProfileHero.svelte',
  'ProfileListItem.svelte',
  'ProfileNameBlock.svelte',
  'ProfileSwitcher.svelte',
  'SidebarNavigation.svelte',
] as const;

const readComponent = async (filename: (typeof displayComponentFiles)[number]) =>
  readFile(new URL(`./${filename}`, import.meta.url), 'utf8');

describe('profile handle display contract', () => {
  test.each(displayComponentFiles)(
    '%s selects Profile.relativeHandle for display',
    async (filename) => {
      const source = await readComponent(filename);

      expect(source).toContain('relativeHandle');
    },
  );

  test.each(displayComponentFiles)(
    '%s does not assemble display handles from handle',
    async (filename) => {
      const source = await readComponent(filename);

      expect(source).not.toMatch(/@\{[^}]*\.handle\}/);
    },
  );
});
