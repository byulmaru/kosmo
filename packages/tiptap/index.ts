import { getSchema } from '@tiptap/core';
import * as nodesObject from './nodes';

export const nodes = Object.values(nodesObject);
export const schema = getSchema(nodes);
