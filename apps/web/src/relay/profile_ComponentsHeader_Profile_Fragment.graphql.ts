/**
 * @generated SignedSource<<f67181eb8c58de909ab7479379cd86ed>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type profile_ComponentsHeader_Profile_Fragment$data = {
  readonly displayName: string;
  readonly handle: string;
  readonly id: string;
  readonly " $fragmentType": "profile_ComponentsHeader_Profile_Fragment";
};
export type profile_ComponentsHeader_Profile_Fragment$key = {
  readonly " $data"?: profile_ComponentsHeader_Profile_Fragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"profile_ComponentsHeader_Profile_Fragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "profile_ComponentsHeader_Profile_Fragment",
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
      "name": "displayName",
      "storageKey": null
    },
    {
      "alias": null,
      "args": null,
      "kind": "ScalarField",
      "name": "handle",
      "storageKey": null
    }
  ],
  "type": "Profile",
  "abstractKey": null
};

(node as any).hash = "e27bb18986b596a70ac65fd10275c6c2";

export default node;
