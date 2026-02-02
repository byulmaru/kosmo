'use client';

import { ReactNode } from 'react';
import { RelayEnvironmentProvider } from 'react-relay';
import { Environment, Network } from 'relay-runtime';
import { fetchQuery } from '@/lib/relay.functions';

type Props = {
  children: ReactNode;
};

const environment = new Environment({
  network: Network.create((request, variables) =>
    fetchQuery({ data: { query: request.text, variables } }),
  ),
});

export default function RelayProvider({ children }: Props) {
  return <RelayEnvironmentProvider environment={environment}>{children}</RelayEnvironmentProvider>;
}
