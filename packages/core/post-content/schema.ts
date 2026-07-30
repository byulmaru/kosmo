import { Schema } from 'prosemirror-model';
import { linkMarkSpec } from './schema/marks/link';
import { docNodeSpec } from './schema/nodes/doc';
import { hardBreakNodeSpec } from './schema/nodes/hard-break';
import { mediaNodeSpec } from './schema/nodes/media';
import { paragraphNodeSpec } from './schema/nodes/paragraph';
import { textNodeSpec } from './schema/nodes/text';

const nodes = {
  doc: docNodeSpec,
  hard_break: hardBreakNodeSpec,
  media: mediaNodeSpec,
  paragraph: paragraphNodeSpec,
  text: textNodeSpec,
};

const marks = {
  link: linkMarkSpec,
};

type PostContentNodeName = keyof typeof nodes;
type PostContentMarkName = keyof typeof marks;

export const postContentSchema = new Schema<PostContentNodeName, PostContentMarkName>({
  nodes,
  marks,
});
