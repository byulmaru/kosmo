/**
 * @generated SignedSource<<435a631683b0291a3cfb8ac6701d88fe>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type Navbar_Fragment$data = {
  readonly " $fragmentSpreads": FragmentRefs<"MenuContent_Fragment">;
  readonly " $fragmentType": "Navbar_Fragment";
};
export type Navbar_Fragment$key = {
  readonly " $data"?: Navbar_Fragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"Navbar_Fragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "Navbar_Fragment",
  "selections": [
    {
      "args": null,
      "kind": "FragmentSpread",
      "name": "MenuContent_Fragment"
    }
  ],
  "type": "Query",
  "abstractKey": null
};

(node as any).hash = "ee63b0d3c5eb6928c731ef7c207f6b9a";

export default node;
