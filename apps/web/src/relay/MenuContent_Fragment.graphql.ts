/**
 * @generated SignedSource<<e79cc1a67871e95733546d918c2ce7d4>>
 * @lightSyntaxTransform
 * @nogrep
 */

/* tslint:disable */
/* eslint-disable */
// @ts-nocheck

import { ReaderFragment } from 'relay-runtime';
import { FragmentRefs } from 'relay-runtime';
export type MenuContent_Fragment$data = {
  readonly usingProfile:
    | {
        readonly id: string;
        readonly relativeHandle: string;
        readonly ' $fragmentSpreads': FragmentRefs<'ProfileDropdown_Profile_Fragment'>;
      }
    | null
    | undefined;
  readonly ' $fragmentType': 'MenuContent_Fragment';
};
export type MenuContent_Fragment$key = {
  readonly ' $data'?: MenuContent_Fragment$data;
  readonly ' $fragmentSpreads': FragmentRefs<'MenuContent_Fragment'>;
};

const node: ReaderFragment = {
  argumentDefinitions: [],
  kind: 'Fragment',
  metadata: null,
  name: 'MenuContent_Fragment',
  selections: [
    {
      alias: null,
      args: null,
      concreteType: 'Profile',
      kind: 'LinkedField',
      name: 'usingProfile',
      plural: false,
      selections: [
        {
          alias: null,
          args: null,
          kind: 'ScalarField',
          name: 'id',
          storageKey: null,
        },
        {
          alias: null,
          args: null,
          kind: 'ScalarField',
          name: 'relativeHandle',
          storageKey: null,
        },
        {
          args: null,
          kind: 'FragmentSpread',
          name: 'ProfileDropdown_Profile_Fragment',
        },
      ],
      storageKey: null,
    },
  ],
  type: 'Query',
  abstractKey: null,
};

(node as any).hash = '3bcae5e1d744fe4695319d43025bf880';

export default node;
