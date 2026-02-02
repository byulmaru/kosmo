/**
 * @generated SignedSource<<0f03a895ef5e47adaebf72968fcadee6>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ConcreteRequest } from 'relay-runtime';
import { FragmentRefs } from 'relay-runtime';
export type MainLayout_Query$variables = Record<PropertyKey, never>;
export type MainLayout_Query$data = {
  readonly ' $fragmentSpreads': FragmentRefs<'Navbar_Fragment' | 'WritePage_Query_Fragment'>;
};
export type MainLayout_Query = {
  response: MainLayout_Query$data;
  variables: MainLayout_Query$variables;
};

const node: ConcreteRequest = (function () {
  var v0 = {
    alias: null,
    args: null,
    kind: 'ScalarField',
    name: 'id',
    storageKey: null,
  };
  return {
    fragment: {
      argumentDefinitions: [],
      kind: 'Fragment',
      metadata: null,
      name: 'MainLayout_Query',
      selections: [
        {
          args: null,
          kind: 'FragmentSpread',
          name: 'Navbar_Fragment',
        },
        {
          args: null,
          kind: 'FragmentSpread',
          name: 'WritePage_Query_Fragment',
        },
      ],
      type: 'Query',
      abstractKey: null,
    },
    kind: 'Request',
    operation: {
      argumentDefinitions: [],
      kind: 'Operation',
      name: 'MainLayout_Query',
      selections: [
        {
          alias: null,
          args: null,
          concreteType: 'Profile',
          kind: 'LinkedField',
          name: 'usingProfile',
          plural: false,
          selections: [
            v0 /*: any*/,
            {
              alias: null,
              args: null,
              kind: 'ScalarField',
              name: 'relativeHandle',
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              kind: 'ScalarField',
              name: 'displayName',
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              kind: 'ScalarField',
              name: 'fullHandle',
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: 'File',
              kind: 'LinkedField',
              name: 'avatar',
              plural: false,
              selections: [
                v0 /*: any*/,
                {
                  alias: null,
                  args: null,
                  kind: 'ScalarField',
                  name: 'url',
                  storageKey: null,
                },
                {
                  alias: null,
                  args: null,
                  kind: 'ScalarField',
                  name: 'placeholder',
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
            {
              alias: null,
              args: null,
              concreteType: 'ProfileConfig',
              kind: 'LinkedField',
              name: 'config',
              plural: false,
              selections: [
                {
                  alias: null,
                  args: null,
                  kind: 'ScalarField',
                  name: 'defaultPostVisibility',
                  storageKey: null,
                },
              ],
              storageKey: null,
            },
          ],
          storageKey: null,
        },
      ],
    },
    params: {
      cacheID: 'd1a6ec3fb8a3b6a846727c5129edd52a',
      id: null,
      metadata: {},
      name: 'MainLayout_Query',
      operationKind: 'query',
      text: 'query MainLayout_Query {\n  ...Navbar_Fragment\n  ...WritePage_Query_Fragment\n}\n\nfragment Avatar_File_Fragment on File {\n  ...Image_File_Fragment\n}\n\nfragment Image_File_Fragment on File {\n  id\n  url\n  placeholder\n}\n\nfragment MenuContent_Fragment on Query {\n  usingProfile {\n    id\n    relativeHandle\n    ...ProfileDropdown_Profile_Fragment\n  }\n}\n\nfragment Navbar_Fragment on Query {\n  ...MenuContent_Fragment\n}\n\nfragment ProfileDropdown_Profile_Fragment on Profile {\n  ...ProfileInfo_Profile_Fragment\n}\n\nfragment ProfileInfo_Profile_Fragment on Profile {\n  id\n  displayName\n  fullHandle\n  relativeHandle\n  avatar {\n    id\n    ...Avatar_File_Fragment\n  }\n}\n\nfragment WritePage_Query_Fragment on Query {\n  usingProfile {\n    id\n    config {\n      defaultPostVisibility\n    }\n    ...ProfileInfo_Profile_Fragment\n  }\n}\n',
    },
  };
})();

(node as any).hash = 'e089562214cbc95520c98517299ed069';

export default node;
