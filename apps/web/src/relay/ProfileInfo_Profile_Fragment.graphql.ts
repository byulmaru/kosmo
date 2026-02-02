/**
 * @generated SignedSource<<ed8a4d051e75f4e083ecb036c9dc75c5>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from 'relay-runtime';
export type ProfileInfo_Profile_Fragment$data = {
  readonly avatar: {
    readonly id: string;
    readonly ' $fragmentSpreads': FragmentRefs<'Avatar_File_Fragment'>;
  };
  readonly displayName: string;
  readonly fullHandle: string;
  readonly id: string;
  readonly relativeHandle: string;
  readonly ' $fragmentType': 'ProfileInfo_Profile_Fragment';
};
export type ProfileInfo_Profile_Fragment$key = {
  readonly ' $data'?: ProfileInfo_Profile_Fragment$data;
  readonly ' $fragmentSpreads': FragmentRefs<'ProfileInfo_Profile_Fragment'>;
};

const node: ReaderFragment = (function () {
  var v0 = {
    alias: null,
    args: null,
    kind: 'ScalarField',
    name: 'id',
    storageKey: null,
  };
  return {
    argumentDefinitions: [],
    kind: 'Fragment',
    metadata: null,
    name: 'ProfileInfo_Profile_Fragment',
    selections: [
      v0 /*: any*/,
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'displayName',
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'fullHandle',
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'relativeHandle',
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        concreteType: 'File',
        kind: 'LinkedField',
        name: 'avatar',
        plural: false,
        selections: [
          v0 /*: any*/,
          {
            args: null,
            kind: 'FragmentSpread',
            name: 'Avatar_File_Fragment',
          },
        ],
        storageKey: null,
      },
    ],
    type: 'Profile',
    abstractKey: null,
  };
})();

(node as any).hash = '9acb9bf916be84e24d9960a9fa573a8b';

export default node;
