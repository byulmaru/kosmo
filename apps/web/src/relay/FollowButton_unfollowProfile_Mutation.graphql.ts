/**
 * @generated SignedSource<<a988111ef1fabf6cb362081616c60e3a>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type ProfileRelationshipState = 'BLOCK' | 'FOLLOW' | 'REQUEST_FOLLOW';
export type UnfollowProfileInput = {
  profileId: string;
};
export type FollowButton_unfollowProfile_Mutation$variables = {
  input: UnfollowProfileInput;
};
export type FollowButton_unfollowProfile_Mutation$data = {
  readonly unfollowProfile:
    | {
        readonly __typename: 'UnfollowProfileSuccess';
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
export type FollowButton_unfollowProfile_Mutation = {
  response: FollowButton_unfollowProfile_Mutation$data;
  variables: FollowButton_unfollowProfile_Mutation$variables;
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
        name: 'unfollowProfile',
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
            type: 'UnfollowProfileSuccess',
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
      name: 'FollowButton_unfollowProfile_Mutation',
      selections: v1 /*: any*/,
      type: 'Mutation',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: v0 /*: any*/,
      kind: 'Operation',
      name: 'FollowButton_unfollowProfile_Mutation',
      selections: v1 /*: any*/,
    },
    params: {
      cacheID: 'fc50d8261988ab30777e1b03eda2a411',
      id: null,
      metadata: {},
      name: 'FollowButton_unfollowProfile_Mutation',
      operationKind: 'mutation',
      text: 'mutation FollowButton_unfollowProfile_Mutation(\n  $input: UnfollowProfileInput!\n) {\n  unfollowProfile(input: $input) {\n    __typename\n    ... on UnfollowProfileSuccess {\n      profile {\n        id\n        followerCount\n        relationship {\n          to\n        }\n      }\n    }\n  }\n}\n',
    },
  };
})();

(node as any).hash = 'e03132b81ca82a460cced5a2b53154fa';

export default node;
