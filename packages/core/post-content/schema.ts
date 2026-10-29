import { Schema } from 'prosemirror-model';
import { customEmojiMarkSpec } from './schema/marks/custom-emoji';
import { linkMarkSpec } from './schema/marks/link';
import { docNodeSpec } from './schema/nodes/doc';
import { hardBreakNodeSpec } from './schema/nodes/hard-break';
import { hashtagNodeSpec } from './schema/nodes/hashtag';
import { mediaNodeSpec } from './schema/nodes/media';
import { mentionNodeSpec } from './schema/nodes/mention';
import { paragraphNodeSpec } from './schema/nodes/paragraph';
import { textNodeSpec } from './schema/nodes/text';

const nodes = {
  doc: docNodeSpec,
  hashtag: hashtagNodeSpec,
  hard_break: hardBreakNodeSpec,
  media: mediaNodeSpec,
  mention: mentionNodeSpec,
  paragraph: paragraphNodeSpec,
  text: textNodeSpec,
};

const marks = {
  custom_emoji: customEmojiMarkSpec,
  link: linkMarkSpec,
};

type PostContentNodeName = keyof typeof nodes;
type PostContentMarkName = keyof typeof marks;

export const postContentSchema = new Schema<PostContentNodeName, PostContentMarkName>({
  nodes,
  marks,
});
