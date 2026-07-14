import { projectRemoteNoteContent } from '@kosmo/core/activitypub-note-content';
import type { Note } from '@fedify/vocab';

export function projectFedifyNoteContent(note: Pick<Note, 'content' | 'mediaType' | 'summary'>) {
  return projectRemoteNoteContent({
    content: note.content?.toString() ?? null,
    summary: note.summary?.toString() ?? null,
    mediaType: note.mediaType,
  });
}
