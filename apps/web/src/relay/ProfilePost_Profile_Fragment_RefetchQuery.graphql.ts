/**
 * @generated SignedSource<<cdbefb9e23b479f16412b95000aa3871>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from 'relay-runtime';
export type ProfilePost_Profile_Fragment_RefetchQuery$variables = {
  count?: number | null | undefined;
  cursor?: string | null | undefined;
  id: string;
};
export type ProfilePost_Profile_Fragment_RefetchQuery$data = {
  readonly node:
    | {
        readonly ' $fragmentSpreads': FragmentRefs<'ProfilePost_Profile_Fragment'>;
      }
    | null
    | undefined;
};
export type ProfilePost_Profile_Fragment_RefetchQuery = {
  response: ProfilePost_Profile_Fragment_RefetchQuery$data;
  variables: ProfilePost_Profile_Fragment_RefetchQuery$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: 10,
        kind: 'LocalArgument',
        name: 'count',
      },
      {
        defaultValue: null,
        kind: 'LocalArgument',
        name: 'cursor',
      },
      {
        defaultValue: null,
        kind: 'LocalArgument',
        name: 'id',
      },
    ],
    v1 = [
      {
        kind: 'Variable',
        name: 'id',
        variableName: 'id',
      },
    ],
    v2 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: '__typename',
      storageKey: null,
    },
    v3 = {
      alias: null,
      args: null,
      kind: 'ScalarField',
      name: 'id',
      storageKey: null,
    },
    v4 = [
      {
        kind: 'Variable',
        name: 'after',
        variableName: 'cursor',
      },
      {
        kind: 'Variable',
        name: 'first',
        variableName: 'count',
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: 'Fragment',
      metadata: null,
      name: 'ProfilePost_Profile_Fragment_RefetchQuery',
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: null,
          kind: 'LinkedField',
          name: 'node',
          plural: false,
          selections: [
            {
              args: [
                {
                  kind: 'Variable',
                  name: 'count',
                  variableName: 'count',
                },
                {
                  kind: 'Variable',
                  name: 'cursor',
                  variableName: 'cursor',
                },
              ],
              kind: 'FragmentSpread',
              name: 'ProfilePost_Profile_Fragment',
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
      name: 'ProfilePost_Profile_Fragment_RefetchQuery',
      selections: [
        {
          alias: null,
          args: v1 /*: any*/,
          concreteType: null,
          kind: 'LinkedField',
          name: 'node',
          plural: false,
          selections: [
            v2 /*: any*/,
            v3 /*: any*/,
            {
              kind: 'InlineFragment',
              selections: [
                {
                  alias: null,
                  args: v4 /*: any*/,
                  concreteType: 'PostConnection',
                  kind: 'LinkedField',
                  name: 'posts',
                  plural: false,
                  selections: [
                    {
                      alias: null,
                      args: null,
                      concreteType: 'PostEdge',
                      kind: 'LinkedField',
                      name: 'edges',
                      plural: true,
                      selections: [
                        {
                          alias: null,
                          args: null,
                          concreteType: 'Post',
                          kind: 'LinkedField',
                          name: 'node',
                          plural: false,
                          selections: [
                            v3 /*: any*/,
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
                                v3 /*: any*/,
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
                                v3 /*: any*/,
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
                                  alias: null,
                                  args: null,
                                  kind: 'ScalarField',
                                  name: 'fullHandle',
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
                                    v3 /*: any*/,
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
                                  ],
                                  storageKey: null,
                                },
                              ],
                              storageKey: null,
                            },
                            v2 /*: any*/,
                          ],
                          storageKey: null,
                        },
                        {
                          alias: null,
                          args: null,
                          kind: 'ScalarField',
                          name: 'cursor',
                          storageKey: null,
                        },
                      ],
                      storageKey: null,
                    },
                    {
                      alias: null,
                      args: null,
                      concreteType: 'PageInfo',
                      kind: 'LinkedField',
                      name: 'pageInfo',
                      plural: false,
                      selections: [
                        {
                          alias: null,
                          args: null,
                          kind: 'ScalarField',
                          name: 'endCursor',
                          storageKey: null,
                        },
                        {
                          alias: null,
                          args: null,
                          kind: 'ScalarField',
                          name: 'hasNextPage',
                          storageKey: null,
                        },
                      ],
                      storageKey: null,
                    },
                  ],
                  storageKey: null,
                },
                {
                  alias: null,
                  args: v4 /*: any*/,
                  filters: null,
                  handle: 'connection',
                  key: 'ProfilePost_posts',
                  kind: 'LinkedHandle',
                  name: 'posts',
                },
              ],
              type: 'Profile',
              abstractKey: null,
            },
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: 'c3a3bba063138307b58cb7c18a030b1b',
      id: null,
      metadata: {},
      name: 'ProfilePost_Profile_Fragment_RefetchQuery',
      operationKind: 'query',
      text: 'query ProfilePost_Profile_Fragment_RefetchQuery(\n  $count: Int = 10\n  $cursor: String\n  $id: ID!\n) {\n  node(id: $id) {\n    __typename\n    ...ProfilePost_Profile_Fragment_1G22uz\n    id\n  }\n}\n\nfragment Avatar_File_Fragment on File {\n  ...Image_File_Fragment\n}\n\nfragment Image_File_Fragment on File {\n  id\n  url\n  placeholder\n}\n\nfragment PostContent_Post_Fragment on Post {\n  id\n  visibility\n  createdAt\n  snapshot {\n    content\n    id\n  }\n  author {\n    id\n    displayName\n    relativeHandle\n    ...ProfileInfo_Profile_Fragment\n  }\n}\n\nfragment ProfileInfo_Profile_Fragment on Profile {\n  id\n  displayName\n  fullHandle\n  relativeHandle\n  avatar {\n    id\n    ...Avatar_File_Fragment\n  }\n}\n\nfragment ProfilePost_Profile_Fragment_1G22uz on Profile {\n  posts(first: $count, after: $cursor) {\n    edges {\n      node {\n        id\n        ...PostContent_Post_Fragment\n        __typename\n      }\n      cursor\n    }\n    pageInfo {\n      endCursor\n      hasNextPage\n    }\n  }\n  id\n}\n',
    },
  };
})();

(node as any).hash = 'd02d97b230b4c7be8a33224e82e0612b';

export default node;
