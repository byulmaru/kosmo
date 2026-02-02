/**
 * @generated SignedSource<<a28a3d719f88b018fc3eacf2aee1275e>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type PostVisibility = "DIRECT" | "FOLLOWER" | "PUBLIC" | "UNLISTED";
import { FragmentRefs } from "relay-runtime";
export type WritePage_Query_Fragment$data = {
  readonly usingProfile: {
    readonly config: {
      readonly defaultPostVisibility: PostVisibility;
    } | null | undefined;
    readonly id: string;
    readonly " $fragmentSpreads": FragmentRefs<"ProfileInfo_Profile_Fragment">;
  } | null | undefined;
  readonly " $fragmentType": "WritePage_Query_Fragment";
};
export type WritePage_Query_Fragment$key = {
  readonly " $data"?: WritePage_Query_Fragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"WritePage_Query_Fragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "WritePage_Query_Fragment",
  "selections": [
    {
      "alias": null,
      "args": null,
      "concreteType": "Profile",
      "kind": "LinkedField",
      "name": "usingProfile",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "id",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "concreteType": "ProfileConfig",
          "kind": "LinkedField",
          "name": "config",
          "plural": false,
          "selections": [
            {
              "alias": null,
              "args": null,
              "kind": "ScalarField",
              "name": "defaultPostVisibility",
              "storageKey": null
            }
          ],
          "storageKey": null
        },
        {
          "args": null,
          "kind": "FragmentSpread",
          "name": "ProfileInfo_Profile_Fragment"
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "aceb5bb650e5fb6dccae32c0b98b8767";

export default node;
