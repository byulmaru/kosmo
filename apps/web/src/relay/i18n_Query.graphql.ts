/**
 * @generated SignedSource<<b4f843b653b78cbc0031c8f937436ed8>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
export type i18n_Query$variables = Record<PropertyKey, never>;
export type i18n_Query$data = {
  readonly languages: ReadonlyArray<string>;
};
export type i18n_Query = {
  response: i18n_Query$data;
  variables: i18n_Query$variables;
};

const node: ConcreteRequest = (function(){
var v0 = [
  {
    "alias": null,
    "args": null,
    "kind": "ScalarField",
    "name": "languages",
    "storageKey": null
  }
];
return {
  "fragment": {
    "argumentDefinitions": [],
    "kind": "Fragment",
    "metadata": null,
    "name": "i18n_Query",
    "selections": (v0/*: any*/),
    "type": "Query",
    "abstractKey": null
  },
  "kind": "Request",
  "operation": {
    "argumentDefinitions": [],
    "kind": "Operation",
    "name": "i18n_Query",
    "selections": (v0/*: any*/)
  },
  "params": {
    "cacheID": "dbf552e3bb582c371d491f1006284be6",
    "id": null,
    "metadata": {},
    "name": "i18n_Query",
    "operationKind": "query",
    "text": "query i18n_Query {\n  languages\n}\n"
  }
};
})();

(node as any).hash = "b0ca0ae9d1c17256035282fa9495177a";

export default node;
