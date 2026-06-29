import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const readComponent = (fileName: string) =>
  readFileSync(fileURLToPath(new URL(fileName, import.meta.url)), 'utf8');

const getRuleBlock = (source: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedSelector}\\s*\\{(?<block>[^}]*)\\}`).exec(source);

  if (!match?.groups?.block) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match.groups.block;
};

describe('post text spacing', () => {
  test('composer paragraphs do not add extra margin between line breaks', () => {
    const source = readComponent('TipTapEditor.svelte');
    const paragraphRule = getRuleBlock(source, ':global(.post-composer-editor p)');

    expect(paragraphRule).toContain('margin: 0;');
    expect(paragraphRule).not.toContain('margin: 0 0 0.75rem;');
  });

  test('rendered post paragraphs do not add extra margin between line breaks', () => {
    const source = readComponent('TipTapRenderer.svelte');
    const paragraphRule = getRuleBlock(source, ':global(.tiptap-renderer p)');

    expect(paragraphRule).toContain('margin: 0;');
    expect(paragraphRule).not.toContain('margin: 0 0 0.75rem;');
  });
});
