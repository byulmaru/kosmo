import { db } from '@kosmo/db';
import { PostVisibility } from '@kosmo/enum';
import { PostManager } from '@kosmo/manager';
import { nodes, schema } from '@kosmo/tiptap';
import { generateJSON } from '@tiptap/html';
import { Node } from '@tiptap/pm/model';
import { UnrecoverableError } from 'bullmq';
import { match } from 'ts-pattern';
import { ActivityPubService, TimelineService } from '..';
import { defineService } from '../define';
import type { JSONContent } from '@tiptap/core';

const isEmpty = (node: JSONContent): boolean => {
  if (node.type !== 'paragraph') {
    return false;
  }
  return (
    node.content?.every((child) =>
      match(child.type)
        .with('text', () => (child.text ?? '').trim() === '')
        .with('hardBreak', () => true)
        .otherwise(() => false),
    ) ?? true
  );
};

const splitByHardBreaks = (paragraph: JSONContent): JSONContent[] => {
  if (!paragraph.content || paragraph.content.length === 0) {
    return [];
  }

  const result: JSONContent[] = [];
  let currentContent: JSONContent[] = [];
  let consecutiveBreaks = 0;

  for (const node of paragraph.content) {
    if (node.type === 'hardBreak') {
      consecutiveBreaks++;
    } else {
      if (consecutiveBreaks >= 2) {
        if (currentContent.length > 0) {
          result.push({
            type: 'paragraph',
            content: currentContent,
          });
          currentContent = [];
        }
      } else if (consecutiveBreaks === 1) {
        currentContent.push({ type: 'hardBreak' });
      }
      consecutiveBreaks = 0;
      currentContent.push(node);
    }
  }

  if (consecutiveBreaks >= 2 && currentContent.length > 0) {
    result.push({
      type: 'paragraph',
      content: currentContent,
    });
    currentContent = [];
  } else if (consecutiveBreaks === 1) {
    currentContent.push({ type: 'hardBreak' });
  }

  if (currentContent.length > 0) {
    result.push({
      type: 'paragraph',
      content: currentContent,
    });
  }

  return result;
};

const normalizeDoc = (doc: JSONContent): JSONContent => {
  if (!doc.content) {
    return doc;
  }

  const result: JSONContent[] = [];

  for (const node of doc.content) {
    if (node.type === 'paragraph') {
      if (isEmpty(node)) {
        continue;
      }
      result.push(...splitByHardBreaks(node));
    } else {
      result.push(node);
    }
  }

  if (result.length === 0) {
    throw new UnrecoverableError('DOC_EMPTY');
  }

  return { ...doc, content: result };
};

type CreateParams = {
  profileId: string;
  visibility: PostVisibility;
  replyToPostId?: string;
  isLocal: boolean;
} & ({ htmlContent: string } | { tiptapContent: JSONContent });

export const create = defineService(
  'post:create',
  async ({ profileId, isLocal, visibility, replyToPostId, ...data }: CreateParams) => {
    const post = await db.transaction(async (tx) => {
      // TODO: 답글을 달 수 있는지 체크

      let content: JSONContent;

      if ('htmlContent' in data) {
        content = generateJSON(data.htmlContent, nodes);
      } else {
        content = data.tiptapContent;
      }

      content = normalizeDoc(content);

      Node.fromJSON(schema, content).check();

      const post = await PostManager.create({
        tx,
        profileId,
        content,
        visibility,
        replyToPostId,
      });

      return post;
    });

    await TimelineService.distribute.queue({ postId: post.id });

    if (isLocal) {
      await ActivityPubService.distribute.queue({ postId: post.id });
    }

    return post;
  },
);
