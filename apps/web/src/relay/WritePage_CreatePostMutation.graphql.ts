/**
 * @generated SignedSource<<c36298891bf36ac6d15aaa0db491c606>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type PostVisibility = "DIRECT" | "FOLLOWER" | "PUBLIC" | "UNLISTED";
export type CreatePostInput = {
  content: any;
  mediaIds?: ReadonlyArray<string> | null | undefined;
  replyToPostId?: string | null | undefined;
  visibility?: PostVisibility | null | undefined;
};
export type WritePage_CreatePostMutation$variables = {
  input: CreatePostInput;
};
export type WritePage_CreatePostMutation$data = {
  readonly createPost: {
    readonly __typename: "CreatePostSuccess";
    readonly post: {
      readonly " $fragmentSpreads": FragmentRefs<"PostContent_Post_Fragment">;
    };
  } | {
    // This will never be '%other', but we need some
    // value in case none of the concrete values match.
    readonly __typename: "%other";
  };
};
export type WritePage_CreatePostMutation = {
  response: WritePage_CreatePostMutation$data;
  variables: WritePage_CreatePostMutation$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "defaultValue": null,
    "kind": "LocalArgument",
    "name": "input"
  }
],
v1 = [
  {
    "kind": "Variable",
    "name": "input",
    "variableName": "input"
  }
],
v2 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "__typename",
  "storageKey": null
},
v3 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Fragment",
    "metadata": null,
    "name": "WritePage_CreatePostMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "createPost",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "Post",
                "kind": "LinkedField",
                "name": "post",
                "plural": false,
                "selections": [
                  {
                    "args": null,
                    "kind": "FragmentSpread",
                    "name": "PostContent_Post_Fragment"
                  }
                ],
                "storageKey": null
              }
            ],
            "type": "CreatePostSuccess",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ],
    "type": "Mutation",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": (v0/*: any*/),
    "kind": "Operation",
    "name": "WritePage_CreatePostMutation",
    "selections": [
      {
        "alias": null,
        "args": (v1/*: any*/),
        "concreteType": null,
        "kind": "LinkedField",
        "name": "createPost",
        "plural": false,
        "selections": [
          (v2/*: any*/),
          {
            "kind": "InlineFragment",
            "selections": [
              {
                "alias": null,
                "args": null,
                "concreteType": "Post",
                "kind": "LinkedField",
                "name": "post",
                "plural": false,
                "selections": [
                  (v3/*: any*/),
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "visibility",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "kind": "ScalarField",
                    "name": "createdAt",
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "PostSnapshot",
                    "kind": "LinkedField",
                    "name": "snapshot",
                    "plural": false,
                    "selections": [
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "content",
                        "storageKey": null
                      },
                      (v3/*: any*/)
                    ],
                    "storageKey": null
                  },
                  {
                    "alias": null,
                    "args": null,
                    "concreteType": "Profile",
                    "kind": "LinkedField",
                    "name": "author",
                    "plural": false,
                    "selections": [
                      (v3/*: any*/),
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "displayName",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "relativeHandle",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "kind": "ScalarField",
                        "name": "fullHandle",
                        "storageKey": null
                      },
                      {
                        "alias": null,
                        "args": null,
                        "concreteType": "File",
                        "kind": "LinkedField",
                        "name": "avatar",
                        "plural": false,
                        "selections": [
                          (v3/*: any*/),
                          {
                            "alias": null,
                            "args": null,
                            "kind": "ScalarField",
                            "name": "url",
                            "storageKey": null
                          },
                          {
                            "alias": null,
                            "args": null,
                            "kind": "ScalarField",
                            "name": "placeholder",
                            "storageKey": null
                          }
                        ],
                        "storageKey": null
                      }
                    ],
                    "storageKey": null
                  }
                ],
                "storageKey": null
              }
            ],
            "type": "CreatePostSuccess",
            "abstractKey": null
          }
        ],
        "storageKey": null
      }
    ]
  },
  "params": {
    "cacheID": "b45bfbfea9b9f1e5ffdb7f4e196af40a",
    "id": null,
    "metadata": {},
    "name": "WritePage_CreatePostMutation",
    "operationKind": "mutation",
    "text": "mutation WritePage_CreatePostMutation(\n  $input: CreatePostInput!\n) {\n  createPost(input: $input) {\n    __typename\n    ... on CreatePostSuccess {\n      post {\n        ...PostContent_Post_Fragment\n        id\n      }\n    }\n  }\n}\n\nfragment Avatar_File_Fragment on File {\n  ...Image_File_Fragment\n}\n\nfragment Image_File_Fragment on File {\n  id\n  url\n  placeholder\n}\n\nfragment PostContent_Post_Fragment on Post {\n  id\n  visibility\n  createdAt\n  snapshot {\n    content\n    id\n  }\n  author {\n    id\n    displayName\n    relativeHandle\n    ...ProfileInfo_Profile_Fragment\n  }\n}\n\nfragment ProfileInfo_Profile_Fragment on Profile {\n  id\n  displayName\n  fullHandle\n  relativeHandle\n  avatar {\n    id\n    ...Avatar_File_Fragment\n  }\n}\n"
  }
};
})();

(node as any).hash = "4bc1d8e6c799956645723123ddfd502d";

export default node;
