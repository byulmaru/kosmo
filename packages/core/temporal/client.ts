import { Client, Connection } from '@temporalio/client';

const address = process.env.TEMPORAL_ADDRESS?.trim();
const namespace = process.env.TEMPORAL_NAMESPACE?.trim();

if (!address) {
  throw new Error('TEMPORAL_ADDRESS is required');
}
if (!namespace) {
  throw new Error('TEMPORAL_NAMESPACE is required');
}

export const temporalClient = new Client({
  connection: Connection.lazy({ address }),
  namespace,
});
