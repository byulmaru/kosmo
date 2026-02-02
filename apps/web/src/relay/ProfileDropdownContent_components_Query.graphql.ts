/**
 * @generated SignedSource<<c202fa2f197c2aef442d318642228e47>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProfileDropdownContent_components_Query$variables = Record<PropertyKey, never>;
export type ProfileDropdownContent_components_Query$data = {
  readonly me: {
    readonly profiles: ReadonlyArray<{
      readonly id: string;
      readonly " $fragmentSpreads": FragmentRefs<"ProfileInfo_Profile_Fragment">;
    }>;
  } | null | undefined;
  readonly usingProfile: {
    readonly id: string;
  } | null | undefined;
};
export type ProfileDropdownContent_components_Query = {
  response: ProfileDropdownContent_components_Query$data;
  variables: ProfileDropdownContent_components_Query$variables;
};

const node: ConcreteRequest = (function(){
var v0 = {
  "alias": null,
  "args": null,
  "kind": "ScalarField",
  "name": "id",
  "storageKey": null
},
v1 = {
  "alias": null,
  "args": null,
  "concreteType": "Profile",
  "kind": "LinkedField",
  "name": "usingProfile",
  "plural": false,
  "selections": [
    (v0/*: any*/)
  ],
  "storageKey": null
};
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "ProfileDropdownContent_components_Query",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "Account",
        "kind": "LinkedField",
        "name": "me",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Profile",
            "kind": "LinkedField",
            "name": "profiles",
            "plural": true,
            "selections": [
              (v0/*: any*/),
              {
                "args": null,
                "kind": "FragmentSpread",
                "name": "ProfileInfo_Profile_Fragment"
              }
            ],
            "storageKey": null
          }
        ],
        "storageKey": null
      },
      (v1/*: any*/)
    ],
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "ProfileDropdownContent_components_Query",
    "selections": [
      {
        "alias": null,
        "args": null,
        "concreteType": "Account",
        "kind": "LinkedField",
        "name": "me",
        "plural": false,
        "selections": [
          {
            "alias": null,
            "args": null,
            "concreteType": "Profile",
            "kind": "LinkedField",
            "name": "profiles",
            "plural": true,
            "selections": [
              (v0/*: any*/),
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
                "name": "fullHandle",
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
                "concreteType": "File",
                "kind": "LinkedField",
                "name": "avatar",
                "plural": false,
                "selections": [
                  (v0/*: any*/),
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
          },
          (v0/*: any*/)
        ],
        "storageKey": null
      },
      (v1/*: any*/)
    ]
  },
  "params": {
    "cacheID": "c4c8ae7544a5268d4618cf1c4999c550",
    "id": null,
    "metadata": {},
    "name": "ProfileDropdownContent_components_Query",
    "operationKind": "query",
    "text": "query ProfileDropdownContent_components_Query {\n  me {\n    profiles {\n      id\n      ...ProfileInfo_Profile_Fragment\n    }\n    id\n  }\n  usingProfile {\n    id\n  }\n}\n\nfragment Avatar_File_Fragment on File {\n  ...Image_File_Fragment\n}\n\nfragment Image_File_Fragment on File {\n  id\n  url\n  placeholder\n}\n\nfragment ProfileInfo_Profile_Fragment on Profile {\n  id\n  displayName\n  fullHandle\n  relativeHandle\n  avatar {\n    id\n    ...Avatar_File_Fragment\n  }\n}\n"
  }
};
})();

(node as any).hash = "aeb75edc7fc6a9950a6208ff3ccf5282";

export default node;
