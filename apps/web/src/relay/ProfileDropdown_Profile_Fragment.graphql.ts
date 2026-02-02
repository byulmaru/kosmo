/**
 * @generated SignedSource<<48f92d7b9b685a0e3cbb8242e71a3888>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type ProfileDropdown_Profile_Fragment$data = {
  readonly " $fragmentSpreads": FragmentRefs<"ProfileInfo_Profile_Fragment">;
  readonly " $fragmentType": "ProfileDropdown_Profile_Fragment";
};
export type ProfileDropdown_Profile_Fragment$key = {
  readonly " $data"?: ProfileDropdown_Profile_Fragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"ProfileDropdown_Profile_Fragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "ProfileDropdown_Profile_Fragment",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "ProfileInfo_Profile_Fragment"
    }
  ],
  "type": "Profile",
  "abstractKey": null
};

(node as any).hash = "3d80beff5ec0c695d03da3fa372a63e0";

export default node;
