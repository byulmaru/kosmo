/**
 * @generated SignedSource<<a2e5e09bfb5f028741453f97bae68cae>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
export type ProfileRelationshipState = "BLOCK" | "FOLLOW" | "REQUEST_FOLLOW";
import { FragmentRefs } from "relay-runtime";
export type FollowButton_Profile_Fragment$data = {
  readonly followerCount: number;
  readonly id: string;
  readonly isMe: boolean;
  readonly relationship: {
    readonly from: ProfileRelationshipState | null | undefined;
    readonly to: ProfileRelationshipState | null | undefined;
  };
  readonly " $fragmentType": "FollowButton_Profile_Fragment";
};
export type FollowButton_Profile_Fragment$key = {
  readonly " $data"?: FollowButton_Profile_Fragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"FollowButton_Profile_Fragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "FollowButton_Profile_Fragment",
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
      "kind": "ScalarField",
      "name": "followerCount",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "isMe",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "concreteType": "ProfileRelationship",
      "kind": "LinkedField",
      "name": "relationship",
      "plural": false,
      "selections": [
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "to",
          "storageKey": null
        },
        {
          "alias": null,
          "args": null,
          "kind": "ScalarField",
          "name": "from",
          "storageKey": null
        }
      ],
      "storageKey": null
    }
  ],
  "type": "Profile",
  "abstractKey": null
};

(node as any).hash = "72a34aca534aa83665bb8091c69d74e9";

export default node;
