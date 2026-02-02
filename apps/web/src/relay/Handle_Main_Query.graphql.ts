/**
 * @generated SignedSource<<f94ad1c79d9d2e228be3070cfebb9171>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from 'relay-runtime';
export type ProfileRelationshipState = 'BLOCK' | 'FOLLOW' | 'REQUEST_FOLLOW';
export type Handle_Main_Query$variables = {
  handle: string;
};
export type Handle_Main_Query$data = {
  readonly profile:
    | {
        readonly avatar: {
          readonly ' $fragmentSpreads': FragmentRefs<'Avatar_File_Fragment'>;
        };
        readonly description: string | null | undefined;
        readonly displayName: string;
        readonly followerCount: number;
        readonly followingCount: number;
        readonly handle: string;
        readonly header:
          | {
              readonly ' $fragmentSpreads': FragmentRefs<'Image_File_Fragment'>;
            }
          | null
          | undefined;
        readonly id: string;
        readonly isMe: boolean;
        readonly relationship: {
          readonly from: ProfileRelationshipState | null | undefined;
          readonly to: ProfileRelationshipState | null | undefined;
        };
        readonly ' $fragmentSpreads': FragmentRefs<
          'FollowButton_Profile_Fragment' | 'profile_ComponentsHeader_Profile_Fragment'
        >;
      }
    | null
    | undefined;
};
export type Handle_Main_Query = {
  response: Handle_Main_Query$data;
  variables: Handle_Main_Query$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: 'LocalArgument',
        name: 'handle',
      },
    ],
    v1 = [
      {
        kind: 'Variable',
        name: 'handle',
        variableName: 'handle',
      },
    ],
    v2 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'id',
      storageKey: null,
    },
    v3 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'displayName',
      storageKey: null,
    },
    v4 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'handle',
      storageKey: null,
    },
    v5 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'description',
      storageKey: null,
    },
    v6 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'followerCount',
      storageKey: null,
    },
    v7 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'followingCount',
      storageKey: null,
    },
    v8 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'isMe',
      storageKey: null,
    },
    v9 = {
      alias: null,
      args: null,
      concreteType: 'ProfileRelationship',
      kind: 'LinkedField',
      name: 'relationship',
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          kind: 'ScalarField',
          name: 'to',
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: 'ScalarField',
          name: 'from',
          storageKey: null,
        },
      ],
      storageKey: null,
    },
    v10 = [
      v2 /*: any*/,
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'url',
        storageKey: null,
      },
      {
        alias: null,
        args: null,
        kind: 'ScalarField',
        name: 'placeholder',
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: 'Fragment',
      metadata: null,
      name: 'Handle_Main_Query',
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: 'Profile',
          kind: 'LinkedField',
          name: 'profile',
          plural: false,
          selections: [
            v2 /*: any*/,
            v3 /*: any*/,
            v4 /*: any*/,
            v5 /*: any*/,
            v6 /*: any*/,
            v7 /*: any*/,
            v8 /*: any*/,
            {
              alias: null,
              args: null,
              concreteType: 'File',
              kind: 'LinkedField',
              name: 'avatar',
              plural: false,
              selections: [
                {
                  args: null,
                  kind: 'FragmentSpread',
                  name: 'Avatar_File_Fragment',
                },
              ],
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: 'File',
              kind: 'LinkedField',
              name: 'header',
              plural: false,
              selections: [
                {
                  args: null,
                  kind: 'FragmentSpread',
                  name: 'Image_File_Fragment',
                },
              ],
              storageKey: null,
            },
            v9 /*: any*/,
            {
              args: null,
              kind: 'FragmentSpread',
              name: 'FollowButton_Profile_Fragment',
            },
            {
              args: null,
              kind: 'FragmentSpread',
              name: 'profile_ComponentsHeader_Profile_Fragment',
            },
          ],
          storageKey: null,
        },
      ],
      type: 'Query',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: 'Operation',
      name: 'Handle_Main_Query',
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: 'Profile',
          kind: 'LinkedField',
          name: 'profile',
          plural: false,
          selections: [
            v2 /*: any*/,
            v3 /*: any*/,
            v4 /*: any*/,
            v5 /*: any*/,
            v6 /*: any*/,
            v7 /*: any*/,
            v8 /*: any*/,
            {
              alias: null,
              args: null,
              concreteType: 'File',
              kind: 'LinkedField',
              name: 'avatar',
              plural: false,
              selections: v10 /*: any*/,
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: 'File',
              kind: 'LinkedField',
              name: 'header',
              plural: false,
              selections: v10 /*: any*/,
              storageKey: null,
            },
            v9 /*: any*/,
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: '510e450c276ab6d418dd6d90def5f86e',
      id: null,
      metadata: {},
      name: 'Handle_Main_Query',
      operationKind: 'query',
      text: 'query Handle_Main_Query(\n  $handle: String!\n) {\n  profile(handle: $handle) {\n    id\n    displayName\n    handle\n    description\n    followerCount\n    followingCount\n    isMe\n    avatar {\n      ...Avatar_File_Fragment\n      id\n    }\n    header {\n      ...Image_File_Fragment\n      id\n    }\n    relationship {\n      to\n      from\n    }\n    ...FollowButton_Profile_Fragment\n    ...profile_ComponentsHeader_Profile_Fragment\n  }\n}\n\nfragment Avatar_File_Fragment on File {\n  ...Image_File_Fragment\n}\n\nfragment FollowButton_Profile_Fragment on Profile {\n  id\n  followerCount\n  isMe\n  relationship {\n    to\n    from\n  }\n}\n\nfragment Image_File_Fragment on File {\n  id\n  url\n  placeholder\n}\n\nfragment profile_ComponentsHeader_Profile_Fragment on Profile {\n  id\n  displayName\n  handle\n}\n',
    },
  };
})();

(node as any).hash = 'b170d243e7533b925aa37134d630f01f';

export default node;
