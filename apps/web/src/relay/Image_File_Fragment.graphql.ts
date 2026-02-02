/**
 * @generated SignedSource<<e34139afc66853f62a8c4e7358fb2f27>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from "relay-runtime";
export type Image_File_Fragment$data = {
  readonly id: string;
  readonly placeholder: string | null | undefined;
  readonly url: string;
  readonly " $fragmentType": "Image_File_Fragment";
};
export type Image_File_Fragment$key = {
  readonly " $data"?: Image_File_Fragment$data;
  readonly " $fragmentSpreads": FragmentRefs<"Image_File_Fragment">;
};

const node: ReaderFragment = {
  "argumentDefinitions": [],
  "kind": "Fragment",
  "metadata": null,
  "name": "Image_File_Fragment",
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
  "type": "File",
  "abstractKey": null
};

(node as any).hash = "336afa17fab5af32c0328664d8d22608";

export default node;
