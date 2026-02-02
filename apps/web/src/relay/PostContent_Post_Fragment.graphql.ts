/**
 * @generated SignedSource<<19eccc7e352dfae9eba719ed32af6eb3>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type PostVisibility = 'DIRECT' | 'FOLLOWER' | 'PUBLIC' | 'UNLISTED';
import { FragmentRefs } from 'relay-runtime';
export type PostContent_Post_Fragment$data = {
  readonly author: {
    readonly displayName: string;
    readonly id: string;
    readonly relativeHandle: string;
    readonly ' $fragmentSpreads': FragmentRefs<'ProfileInfo_Profile_Fragment'>;
  };
  readonly createdAt: any;
  readonly id: string;
  readonly snapshot:
    | {
        readonly content: any | null | undefined;
      }
    | null
    | undefined;
  readonly visibility: PostVisibility;
  readonly ' $fragmentType': 'PostContent_Post_Fragment';
};
export type PostContent_Post_Fragment$key = {
  readonly ' $data'?: PostContent_Post_Fragment$data;
  readonly ' $fragmentSpreads': FragmentRefs<'PostContent_Post_Fragment'>;
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
    name: 'PostContent_Post_Fragment',
    selections: [
      v0 /*: any*/,
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'visibility',
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'createdAt',
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        concreteType: 'PostSnapshot',
        kind: 'LinkedField',
        name: 'snapshot',
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
            kind: 'ScalarField',
            name: 'content',
            storageKey: null,
          },
        ],
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        concreteType: 'Profile',
        kind: 'LinkedField',
        name: 'author',
        plural: false,
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
            name: 'relativeHandle',
            storageKey: null,
          },
          {
            args: null,
            kind: 'FragmentSpread',
            name: 'ProfileInfo_Profile_Fragment',
          },
        ],
        storageKey: null,
      },
    ],
    type: 'Post',
    abstractKey: null,
  };
})();

(node as any).hash = '35f7976cfeb3926f8009092eaffcbc15';

export default node;
