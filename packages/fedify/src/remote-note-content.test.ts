import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LanguageString, Note } from '@fedify/vocab';
import { projectFedifyNoteContent } from './remote-note-content';

describe('projectFedifyNoteContent', () => {
  it('converts primitive Note content and summary at the Fedify boundary', () => {
    assert.deepEqual(
      projectFedifyNoteContent(
        new Note({ content: '<p>body</p>', summary: '<p>warning</p>', mediaType: 'text/html' }),
      ),
      { bodyText: 'body', contentWarning: 'warning' },
    );
  });

  it('converts LanguageString values without projecting their locale', () => {
    assert.deepEqual(
      projectFedifyNoteContent(
        new Note({
          content: new LanguageString('<p>본문</p>', 'ko'),
          summary: new LanguageString('<p>주의</p>', 'ko'),
          mediaType: 'text/html',
        }),
      ),
      { bodyText: '본문', contentWarning: '주의' },
    );
  });
});
