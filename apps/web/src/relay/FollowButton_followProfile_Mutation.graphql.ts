/**
 * @generated SignedSource<<3faa6d48f05b5f791c11cbbde1e4255f>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type ProfileRelationshipState = 'BLOCK' | 'FOLLOW' | 'REQUEST_FOLLOW';
export type FollowProfileInput = {
  profileId: string;
};
export type FollowButton_followProfile_Mutation$variables = {
  input: FollowProfileInput;
};
export type FollowButton_followProfile_Mutation$data = {
  readonly followProfile:
    | {
        readonly __typename: 'FollowProfileSuccess';
        readonly profile: {
          readonly followerCount: number;
          readonly id: string;
          readonly relationship: {
            readonly to: ProfileRelationshipState | null | undefined;
          };
        };
      }
    | {
        // This will never be '%other', but we need some
        // value in case none of the concrete values match.
        readonly __typename: '%other';
      };
};
export type FollowButton_followProfile_Mutation = {
  response: FollowButton_followProfile_Mutation$data;
  variables: FollowButton_followProfile_Mutation$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = [
      {
        defaultValue: null,
        kind: 'LocalArgument',
        name: 'input',
      },
    ],
    v1 = [
      {
        alias: null,
        args: [
          {
            kind: 'Variable',
            name: 'input',
            variableName: 'input',
          },
        ],
        concreteType: null,
        kind: 'LinkedField',
        name: 'followProfile',
        plural: false,
        selections: [
          {
            alias: null,
            args: null,
            kind: 'ScalarField',
            name: '__typename',
            storageKey: null,
          },
          {
            kind: 'InlineFragment',
            selections: [
              {
                alias: null,
                args: null,
                concreteType: 'Profile',
                kind: 'LinkedField',
                name: 'profile',
                plural: false,
                selections: [
                  {
                    alias: null,
                    args: null,
                    kind: 'ScalarField',
                    name: 'id',
                    storageKey: null,
                  },
                  {
                    alias: null,
                    args: null,
                    kind: 'ScalarField',
                    name: 'followerCount',
                    storageKey: null,
                  },
                  {
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
                    ],
                    storageKey: null,
                  },
                ],
                storageKey: null,
              },
            ],
            type: 'FollowProfileSuccess',
            abstractKey: null,
          },
        ],
        storageKey: null,
      },
    ];
  return {
    fragment: {
      argumentDefinitions: v0 /*: any*/,
      kind: 'Fragment',
      metadata: null,
      name: 'FollowButton_followProfile_Mutation',
      selections: v1 /*: any*/,
      type: 'Mutation',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: 'Operation',
      name: 'FollowButton_followProfile_Mutation',
      selections: v1 /*: any*/,
    },
    params: {
      cacheID: '268983268452c97056d152e3f09cb9b4',
      id: null,
      metadata: {},
      name: 'FollowButton_followProfile_Mutation',
      operationKind: 'mutation',
      text: 'mutation FollowButton_followProfile_Mutation(\n  $input: FollowProfileInput!\n) {\n  followProfile(input: $input) {\n    __typename\n    ... on FollowProfileSuccess {\n      profile {\n        id\n        followerCount\n        relationship {\n          to\n        }\n      }\n    }\n  }\n}\n',
    },
  };
})();

(node as any).hash = '196a90c138b2d0c37519542b84001738';

export default node;
