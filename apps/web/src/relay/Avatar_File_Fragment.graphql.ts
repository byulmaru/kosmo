/**
 * @generated SignedSource<<456c422da2d36b8585bd3d9a34f311b2>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from 'relay-runtime';
export type Avatar_File_Fragment$data = {
  readonly ' $fragmentSpreads': FragmentRefs<'Image_File_Fragment'>;
  readonly ' $fragmentType': 'Avatar_File_Fragment';
};
export type Avatar_File_Fragment$key = {
  readonly ' $data'?: Avatar_File_Fragment$data;
  readonly ' $fragmentSpreads': FragmentRefs<'Avatar_File_Fragment'>;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: 'Fragment',
  metadata: null,
  name: 'Avatar_File_Fragment',
  selections: [
    {
      args: null,
      kind: 'FragmentSpread',
      name: 'Image_File_Fragment',
    },
  ],
  type: 'File',
  abstractKey: null,
};

(node as any).hash = 'c4badf563f6b18280ce115fb37e55fda';

export default node;
